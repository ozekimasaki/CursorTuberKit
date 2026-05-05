import { Agent } from "@cursor/sdk"
import { characterProfile } from "../shared/characterProfile.js"

type CursorWorkerInput = {
  compiledPrompt: string
}

type CursorWorkerOutput =
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "text"; text: string }

export class CursorConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CursorConfigurationError"
  }
}

const apiKey = process.env.CURSOR_API_KEY?.trim()
const model = process.env.CURSOR_MODEL?.trim() || "composer-2"

if (!apiKey) {
  throw new CursorConfigurationError(
    "CURSOR_API_KEY が未設定です。.env または環境変数に Cursor API キーを設定してください。",
  )
}

const { compiledPrompt } = await readInput()
const agent = await Agent.create({
  apiKey,
  name: characterProfile.agentName,
  model: { id: model },
  local: { cwd: process.cwd() },
})

let run: Awaited<ReturnType<typeof agent.send>> | null = null
let cancelPromise: Promise<void> | null = null

const cancelRun = () => {
  if (!run) {
    return Promise.resolve()
  }

  if (!cancelPromise) {
    cancelPromise = run.cancel().catch(() => undefined)
  }

  return cancelPromise
}

const handleSignal = () => {
  void cancelRun().finally(() => {
    process.exit(0)
  })
}

process.once("SIGINT", handleSignal)
process.once("SIGTERM", handleSignal)

try {
  run = await agent.send(compiledPrompt)

  for await (const event of run.stream()) {
    if (event.type !== "assistant") {
      continue
    }

    for (const block of event.message.content) {
      if (block.type === "text" && block.text) {
        writeOutput({ type: "text", text: block.text })
      }
    }
  }

  await run.wait()
  writeOutput({ type: "done" })
} catch (error) {
  writeOutput({
    type: "error",
    message: error instanceof Error ? error.message : "Cursor 応答の生成に失敗しました。",
  })
  process.exitCode = 1
} finally {
  if (typeof agent[Symbol.asyncDispose] === "function") {
    await agent[Symbol.asyncDispose]()
  } else {
    agent.close()
  }
}

async function readInput() {
  const chunks: Buffer[] = []

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim()

  if (!raw) {
    throw new Error("Cursor worker input is empty.")
  }

  return JSON.parse(raw) as CursorWorkerInput
}

function writeOutput(payload: CursorWorkerOutput) {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}
