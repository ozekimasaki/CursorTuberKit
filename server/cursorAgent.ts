import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { ChatActionPayload, ChatSessionPayload } from "../shared/chatStream.js"
import type { CharacterArtifactsPayload } from "../shared/characterAgents.js"
import type { FinalEmotionPayload } from "../shared/emotion.js"
import type { StreamAiResponseOptions } from "./aiCommon.js"

const isBunRuntime = typeof globalThis === "object" && "Bun" in globalThis
let cachedNodeExecutable: string | null = null

type CursorWorkerEvent =
  | { type: "action"; payload: ChatActionPayload }
  | { type: "character-artifacts"; payload: CharacterArtifactsPayload }
  | { type: "done" }
  | { type: "emotion"; payload: FinalEmotionPayload }
  | { type: "error"; message: string }
  | { type: "session"; payload: ChatSessionPayload }
  | { type: "text"; text: string }

export class CursorConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CursorConfigurationError"
  }
}

export function validateCursorConfiguration() {
  if (!process.env.CURSOR_API_KEY?.trim()) {
    throw new CursorConfigurationError(
      "CURSOR_API_KEY が未設定です。.env または環境変数に Cursor API キーを設定してください。",
    )
  }
}

export async function streamCursorResponse({
  compiledPrompt,
  onEmotion,
  onSupportingEvent,
  onText,
  route,
  session,
  signal,
}: StreamAiResponseOptions) {
  validateCursorConfiguration()

  if (signal.aborted) {
    return
  }

  const child = spawnCursorWorker()
  let stdoutBuffer = ""
  let stderrBuffer = ""
  let sawDone = false
  let abortTimeout: NodeJS.Timeout | null = null

  const handleAbort = () => {
    if (child.killed) {
      return
    }

    child.kill("SIGTERM")

    abortTimeout = setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGKILL")
      }
    }, 2000)
  }

  signal.addEventListener("abort", handleAbort, { once: true })
  child.stdin.end(
    JSON.stringify({
      compiledPrompt,
      route,
      session,
    }),
  )

  try {
    await new Promise<void>((resolve, reject) => {
      const rejectWithError = (message: string) => {
        reject(new Error(message))
      }

      child.stderr.setEncoding("utf8")
      child.stderr.on("data", (chunk: string) => {
        stderrBuffer += chunk
      })

      child.stdout.setEncoding("utf8")
      child.stdout.on("data", (chunk: string) => {
        stdoutBuffer += chunk

        while (true) {
          const newlineIndex = stdoutBuffer.indexOf("\n")

          if (newlineIndex === -1) {
            break
          }

          const line = stdoutBuffer.slice(0, newlineIndex).trim()
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)

          if (!line) {
            continue
          }

          let event: CursorWorkerEvent

          try {
            event = JSON.parse(line) as CursorWorkerEvent
          } catch {
            rejectWithError(`Cursor worker returned invalid output: ${line}`)
            return
          }

          if (event.type === "text") {
            onText(event.text)
            continue
          }

          if (event.type === "session" || event.type === "action" || event.type === "character-artifacts") {
            onSupportingEvent?.(event)
            continue
          }

          if (event.type === "emotion") {
            onEmotion?.(event.payload)
            continue
          }

          if (event.type === "done") {
            sawDone = true
            continue
          }

          rejectWithError(event.message)
          return
        }
      })

      child.on("error", (error) => {
        reject(error)
      })

      child.on("exit", (code, workerSignal) => {
        if (signal.aborted || workerSignal === "SIGTERM" || workerSignal === "SIGKILL") {
          resolve()
          return
        }

        if (code === 0 && sawDone) {
          resolve()
          return
        }

        const stderrMessage = stderrBuffer.trim()
        reject(
          new Error(
            stderrMessage || `Cursor worker exited unexpectedly (code: ${code ?? "null"}, signal: ${workerSignal ?? "none"}).`,
          ),
        )
      })
    })
  } finally {
    signal.removeEventListener("abort", handleAbort)

    if (abortTimeout) {
      clearTimeout(abortTimeout)
    }
  }
}

function spawnCursorWorker() {
  const nodeExecutable = resolveNodeExecutable()
  const workerEntry = resolveCursorWorkerEntry()
  const args = workerEntry.type === "ts" ? [workerEntry.loader, workerEntry.entry] : [workerEntry.entry]

  return spawn(nodeExecutable, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CURSOR_API_KEY: process.env.CURSOR_API_KEY?.trim() ?? "",
    },
    stdio: ["pipe", "pipe", "pipe"],
  })
}

function resolveNodeExecutable() {
  if (cachedNodeExecutable) {
    return cachedNodeExecutable
  }

  const envOverride = process.env.NODE_EXECUTABLE?.trim()

  if (envOverride) {
    cachedNodeExecutable = envOverride
    return cachedNodeExecutable
  }

  if (!isBunRuntime) {
    cachedNodeExecutable = process.execPath
    return cachedNodeExecutable
  }

  const nodeFromPath = readCommandOutput("node", ["-p", "process.execPath"])

  if (nodeFromPath) {
    cachedNodeExecutable = nodeFromPath
    return cachedNodeExecutable
  }

  const nodeFromDevbox = readCommandOutput("devbox", ["run", "--", "node", "-p", "process.execPath"])

  if (nodeFromDevbox) {
    cachedNodeExecutable = nodeFromDevbox
    return cachedNodeExecutable
  }

  throw new CursorConfigurationError(
    "Cursor プロバイダを Bun で使うには Node.js 実行ファイルが必要です。Node を PATH に通すか、NODE_EXECUTABLE を設定してください。",
  )
}

function readCommandOutput(command: string, args: string[]) {
  try {
    const result = spawnSync(command, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })

    if (result.status !== 0) {
      return null
    }

    const output = result.stdout.trim()

    return output || null
  } catch {
    return null
  }
}

function resolveCursorWorkerEntry() {
  const currentFilePath = fileURLToPath(import.meta.url)
  const builtWorkerPath = fileURLToPath(new URL("../dist/server/cursorWorker.js", import.meta.url))

  if (existsSync(builtWorkerPath)) {
    return {
      type: "js" as const,
      entry: builtWorkerPath,
    }
  }

  if (currentFilePath.endsWith(".ts")) {
    return {
      type: "ts" as const,
      entry: fileURLToPath(new URL("./cursorWorker.ts", import.meta.url)),
      loader: fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url)),
    }
  }

  return {
    type: "js" as const,
    entry: fileURLToPath(new URL("./cursorWorker.js", import.meta.url)),
  }
}
