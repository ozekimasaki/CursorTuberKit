import express, { type Request, type Response } from "express"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { characterProfile } from "../shared/characterProfile.js"
import { buildAvatarPrompt, type ConversationTurn } from "./aiCommon.js"
import { readAiProvider, streamAiResponse, validateAiConfiguration } from "./aiProvider.js"
import {
  loadMemKraftPromptContext,
  persistMemKraftExchange,
  validateMemKraftConfiguration,
} from "./memkraft.js"
import { getVoicevoxHealth, synthesizeVoice, VoicevoxError } from "./voicevox.js"

const isBunRuntime = typeof globalThis === "object" && "Bun" in globalThis

if (!isBunRuntime) {
  await import("dotenv/config")
}

type ChatStreamRequestBody = {
  prompt?: unknown
  recentTurns?: unknown
}

type VoicevoxSynthesisRequestBody = {
  text?: unknown
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const port = Number(process.env.PORT ?? 8787)

app.use(express.json({ limit: "64kb" }))

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: characterProfile.serviceSlug,
  })
})

app.get("/api/voicevox/health", async (_request, response) => {
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), 3000)

  try {
    response.json(await getVoicevoxHealth(abortController.signal))
  } finally {
    clearTimeout(timeout)
  }
})

app.post(
  "/api/voicevox/synthesis",
  async (request: Request<unknown, unknown, VoicevoxSynthesisRequestBody>, response) => {
    const text = parseSpeechText(request.body)

    if (!text) {
      response.status(400).json({ error: "text は1文字以上1000文字以下で指定してください。" })
      return
    }

    const abortController = new AbortController()
    let streamCompleted = false

    response.on("close", () => {
      if (!streamCompleted) {
        abortController.abort()
      }
    })

    try {
      const wav = await synthesizeVoice({ signal: abortController.signal, text })

      if (!abortController.signal.aborted) {
        streamCompleted = true
        response.setHeader("Content-Type", "audio/wav")
        response.setHeader("Cache-Control", "no-store")
        response.send(wav)
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        streamCompleted = true
        response.status(error instanceof VoicevoxError ? 502 : 500).json({ error: getErrorMessage(error) })
      }
    }
  },
)

app.post("/api/chat/stream", async (request: Request<unknown, unknown, ChatStreamRequestBody>, response) => {
  const prompt = parsePrompt(request.body)
  const recentTurns = parseRecentTurns(request.body)

  if (!prompt) {
    response.status(400).json({ error: "prompt は1文字以上4000文字以下で指定してください。" })
    return
  }

  if (recentTurns === null) {
    response.status(400).json({ error: "recentTurns は role と text を持つ配列で指定してください。" })
    return
  }

  let provider
  let memKraftContext

  try {
    provider = readAiProvider()
    await validateAiConfiguration(provider)
    await validateMemKraftConfiguration()
    memKraftContext = await loadMemKraftPromptContext()
  } catch (error) {
    response.status(500).json({ error: getErrorMessage(error) })
    return
  }

  const abortController = new AbortController()
  let hasSentSpeakingState = false
  let streamCompleted = false
  let fullResponseText = ""
  const compiledPrompt = buildAvatarPrompt(prompt, {
    memoryContext: memKraftContext,
    recentTurns,
  })

  response.on("close", () => {
    if (!streamCompleted) {
      abortController.abort()
    }
  })

  prepareSseResponse(response)
  writeSse(response, "state", { state: "thinking" })

  try {
    await streamAiResponse(provider, {
      compiledPrompt,
      signal: abortController.signal,
      onText: (text) => {
        if (!hasSentSpeakingState) {
          hasSentSpeakingState = true
          writeSse(response, "state", { state: "speaking" })
        }

        fullResponseText += text
        writeSse(response, "text", { text })
      },
    })

    if (!abortController.signal.aborted) {
      if (!fullResponseText.trim()) {
        writeSse(response, "error", { message: "AI から空の応答が返りました。" })
        return
      }

      await persistMemKraftExchange({
        assistantResponse: fullResponseText,
        recentTurns,
        userPrompt: prompt,
      })
      writeSse(response, "state", { state: "done" })
      writeSse(response, "done", { ok: true })
    }
  } catch (error) {
    if (!abortController.signal.aborted) {
      writeSse(response, "error", { message: getErrorMessage(error) })
    }
  } finally {
    streamCompleted = true
    response.end()
  }
})

if (process.env.NODE_ENV === "production") {
  const clientDistPath = path.resolve(__dirname, "../client")
  app.use(express.static(clientDistPath))
  app.get("*", (_request, response) => {
    response.sendFile(path.join(clientDistPath, "index.html"))
  })
}

app.listen(port, () => {
  console.log(`${characterProfile.agentName} server listening on http://localhost:${port}`)
})

function parsePrompt(body: ChatStreamRequestBody) {
  if (typeof body.prompt !== "string") {
    return null
  }

  const prompt = body.prompt.trim()

  if (!prompt || prompt.length > 4000) {
    return null
  }

  return prompt
}

function parseRecentTurns(body: ChatStreamRequestBody): ConversationTurn[] | null {
  if (body.recentTurns === undefined) {
    return []
  }

  if (!Array.isArray(body.recentTurns) || body.recentTurns.length > 12) {
    return null
  }

  const turns: ConversationTurn[] = []

  for (const entry of body.recentTurns) {
    if (!isRecord(entry)) {
      return null
    }

    if ((entry.role !== "user" && entry.role !== "assistant") || typeof entry.text !== "string") {
      return null
    }

    const text = entry.text.trim()

    if (!text || text.length > 1000) {
      return null
    }

    turns.push({ role: entry.role, text })
  }

  return turns
}

function parseSpeechText(body: VoicevoxSynthesisRequestBody) {
  if (typeof body.text !== "string") {
    return null
  }

  const text = body.text.trim()

  if (!text || text.length > 1000) {
    return null
  }

  return text
}

function prepareSseResponse(response: Response) {
  response.status(200)
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8")
  response.setHeader("Cache-Control", "no-cache, no-transform")
  response.setHeader("Connection", "keep-alive")
  response.flushHeaders()
}

function writeSse(response: Response, event: string, data: unknown) {
  response.write(`event: ${event}\n`)
  response.write(`data: ${JSON.stringify(data)}\n\n`)
}

function getErrorMessage(error: unknown) {
  return extractErrorMessage(error, new Set()) ?? "AI応答の生成中に不明なエラーが発生しました。"
}

function extractErrorMessage(value: unknown, seen: Set<object>): string | null {
  if (typeof value === "string") {
    const message = value.trim()

    if (!message) {
      return null
    }

    const parsedJson = parseJsonMessage(message)

    return extractErrorMessage(parsedJson, seen) ?? message
  }

  if (value instanceof Error) {
    return extractErrorMessage(value.message, seen) ?? value.name
  }

  if (!isRecord(value)) {
    return null
  }

  if (seen.has(value)) {
    return null
  }

  seen.add(value)

  return (
    extractErrorMessage(value.message, seen) ??
    extractErrorMessage(value.error, seen) ??
    extractErrorMessage(value.details, seen)
  )
}

function parseJsonMessage(message: string) {
  if (!message.startsWith("{") && !message.startsWith("[")) {
    return null
  }

  try {
    return JSON.parse(message)
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
