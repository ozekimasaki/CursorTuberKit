import { spawn, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ConversationTurn, MemKraftPromptContext, StoredExchange } from "./aiCommon.js"

type LoadContextResponse = {
  continuity_notes?: unknown
  injection?: unknown
  recent_exchanges?: unknown
  running_summary?: unknown
}

type HealthResponse = {
  agent_id?: unknown
  channel_id?: unknown
  memory_dir?: unknown
  ok?: unknown
}

type StoreExchangePayload = {
  assistantResponse: string
  recentTurns: ConversationTurn[]
  userPrompt: string
}

const helperPath = fileURLToPath(new URL("./memkraft_bridge.py", import.meta.url))
let cachedPythonExecutable: string | null = null

export class MemKraftError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MemKraftError"
  }
}

export class MemKraftConfigurationError extends MemKraftError {
  constructor(message: string) {
    super(message)
    this.name = "MemKraftConfigurationError"
  }
}

export async function validateMemKraftConfiguration() {
  const result = await runMemKraftCommand<HealthResponse>("health", {})

  if (result.ok !== true) {
    throw new MemKraftConfigurationError("MemKraft の初期化に失敗しました。")
  }
}

export async function loadMemKraftPromptContext(): Promise<MemKraftPromptContext> {
  const result = await runMemKraftCommand<LoadContextResponse>("load_context", {})

  return {
    continuityNotes: normalizeStringList(result.continuity_notes),
    injection: typeof result.injection === "string" ? result.injection.trim() : "",
    recentExchanges: normalizeStoredExchanges(result.recent_exchanges),
    runningSummary: typeof result.running_summary === "string" ? result.running_summary.trim() : "",
  }
}

export async function persistMemKraftExchange(payload: StoreExchangePayload) {
  await runMemKraftCommand("store_exchange", {
    assistant_response: payload.assistantResponse,
    recent_turns: payload.recentTurns,
    user_prompt: payload.userPrompt,
  })
}

async function runMemKraftCommand<T>(command: string, payload: unknown): Promise<T> {
  if (!existsSync(helperPath)) {
    throw new MemKraftConfigurationError(`MemKraft helper が見つかりません: ${helperPath}`)
  }

  const pythonExecutable = resolvePythonExecutable()

  return new Promise<T>((resolve, reject) => {
    const child = spawn(pythonExecutable, [helperPath, command], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MEMKRAFT_AGENT_ID: process.env.MEMKRAFT_AGENT_ID?.trim() || "catlin",
        MEMKRAFT_CHANNEL_ID: process.env.MEMKRAFT_CHANNEL_ID?.trim() || "catlin-global",
        MEMKRAFT_DIR: resolveMemKraftDir(),
      },
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    const timeout = setTimeout(() => {
      child.kill("SIGKILL")
    }, 10000)

    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk
    })

    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk
    })

    child.on("error", (error) => {
      clearTimeout(timeout)
      reject(
        new MemKraftConfigurationError(
          `MemKraft helper の起動に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
        ),
      )
    })

    child.on("exit", (code, signal) => {
      clearTimeout(timeout)

      if (signal) {
        reject(new MemKraftError(`MemKraft helper が ${signal} で終了しました。`))
        return
      }

      if (code !== 0) {
        reject(
          new MemKraftError(
            stderr.trim() || `MemKraft helper が異常終了しました (code: ${code ?? "null"}).`,
          ),
        )
        return
      }

      const trimmed = stdout.trim()

      if (!trimmed) {
        reject(new MemKraftError("MemKraft helper から応答が返りませんでした。"))
        return
      }

      const jsonLine = trimmed
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .at(-1)

      if (!jsonLine) {
        reject(new MemKraftError("MemKraft helper から JSON 応答を取得できませんでした。"))
        return
      }

      try {
        resolve(JSON.parse(jsonLine) as T)
      } catch {
        reject(new MemKraftError(`MemKraft helper の応答を解釈できませんでした: ${trimmed}`))
      }
    })

    child.stdin.end(JSON.stringify(payload))
  })
}

function resolveMemKraftDir() {
  const configured = process.env.MEMKRAFT_DIR?.trim()

  if (configured) {
    return path.resolve(process.cwd(), configured)
  }

  return path.resolve(process.cwd(), "memory")
}

function resolvePythonExecutable() {
  if (cachedPythonExecutable) {
    return cachedPythonExecutable
  }

  const envOverride = process.env.MEMKRAFT_PYTHON_BIN?.trim()

  if (envOverride) {
    cachedPythonExecutable = envOverride
    return cachedPythonExecutable
  }

  for (const candidate of ["python3", "python"]) {
    if (commandExists(candidate)) {
      cachedPythonExecutable = candidate
      return cachedPythonExecutable
    }
  }

  throw new MemKraftConfigurationError(
    "Python 実行ファイルが見つかりません。python3 をインストールするか MEMKRAFT_PYTHON_BIN を設定してください。",
  )
}

function commandExists(command: string) {
  try {
    const result = spawnSync(command, ["--version"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })

    return result.status === 0
  } catch {
    return false
  }
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(-6)
}

function normalizeStoredExchanges(value: unknown): StoredExchange[] {
  if (!Array.isArray(value)) {
    return []
  }

  const exchanges: StoredExchange[] = []

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue
    }

    const user = typeof entry.user === "string" ? entry.user.trim() : ""
    const assistant = typeof entry.assistant === "string" ? entry.assistant.trim() : ""

    if (!user || !assistant) {
      continue
    }

    exchanges.push({ assistant, user })
  }

  return exchanges.slice(-6)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
