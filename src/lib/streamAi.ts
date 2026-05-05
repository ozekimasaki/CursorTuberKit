type StreamState = "thinking" | "speaking" | "done"

export type ConversationTurn = {
  role: "assistant" | "user"
  text: string
}

export type AiStreamEvent =
  | { type: "state"; state: StreamState }
  | { type: "text"; text: string }
  | { type: "error"; message: string }
  | { type: "done" }

type RawSseEvent = {
  event: string
  data: unknown
}

type StreamAiRequest = {
  prompt: string
  recentTurns: ConversationTurn[]
  signal: AbortSignal
}

export async function* streamAiResponse({
  prompt,
  recentTurns,
  signal,
}: StreamAiRequest): AsyncGenerator<AiStreamEvent> {
  const response = await fetch("/api/chat/stream", {
    body: JSON.stringify({ prompt, recentTurns }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  })

  if (!response.ok) {
    const message = await readErrorMessage(response)
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error("ストリーミング応答の本文がありません。")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split("\n\n")
    buffer = frames.pop() ?? ""

    for (const frame of frames) {
      const parsed = parseSseFrame(frame)

      if (!parsed) {
        continue
      }

      yield toAiStreamEvent(parsed)
    }
  }

  buffer += decoder.decode()

  if (buffer.trim()) {
    const parsed = parseSseFrame(buffer)

    if (parsed) {
      yield toAiStreamEvent(parsed)
    }
  }
}

async function readErrorMessage(response: Response) {
  const contentType = response.headers.get("Content-Type") ?? ""

  if (contentType.includes("application/json")) {
    const body = (await response.json()) as unknown

    if (isRecord(body) && typeof body.error === "string") {
      return body.error
    }
  }

  const text = await response.text()
  return text || `サーバーエラーが発生しました。HTTP ${response.status}`
}

function parseSseFrame(frame: string): RawSseEvent | null {
  const lines = frame.split("\n")
  let eventName = "message"
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim()
      continue
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart())
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  return {
    event: eventName,
    data: JSON.parse(dataLines.join("\n")) as unknown,
  }
}

function toAiStreamEvent(raw: RawSseEvent): AiStreamEvent {
  if (raw.event === "state" && isRecord(raw.data) && isStreamState(raw.data.state)) {
    return { type: "state", state: raw.data.state }
  }

  if (raw.event === "text" && isRecord(raw.data) && typeof raw.data.text === "string") {
    return { type: "text", text: raw.data.text }
  }

  if (raw.event === "error" && isRecord(raw.data) && typeof raw.data.message === "string") {
    return { type: "error", message: raw.data.message }
  }

  if (raw.event === "done") {
    return { type: "done" }
  }

  throw new Error(`未知のストリームイベントを受信しました: ${raw.event}`)
}

function isStreamState(value: unknown): value is StreamState {
  return value === "thinking" || value === "speaking" || value === "done"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
