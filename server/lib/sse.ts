import type { Response } from "express"
import type { ChatStreamEvent } from "../../shared/chatStream.js"
import type { ChatRunRecap } from "../runtimeStatus.js"

export function prepareSseResponse(response: Response) {
  response.status(200)
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8")
  response.setHeader("Cache-Control", "no-cache, no-transform")
  response.setHeader("Connection", "keep-alive")
  response.flushHeaders()
}

export function writeSse(response: Response, event: string, data: unknown) {
  response.write(`event: ${event}\n`)
  response.write(`data: ${JSON.stringify(data)}\n\n`)
}

export function writeMetadata(
  response: Response,
  event: string,
  payload: {
    detail?: string | null
    label: string
    name?: string | null
    raw?: unknown
    status?: string | null
    task?: string | null
  },
) {
  writeSse(response, event, {
    detail: payload.detail ?? null,
    label: payload.label,
    name: payload.name ?? null,
    raw: payload.raw ?? null,
    status: payload.status ?? null,
    task: payload.task ?? null,
  })
}

export function writeChatEvent(response: Response, event: ChatStreamEvent) {
  switch (event.type) {
    case "action":
    case "character-artifacts":
    case "emotion":
    case "metadata":
    case "session":
      writeSse(response, event.type, event.payload)
      return
    case "done":
      writeSse(response, "done", { ok: true })
      return
    case "error":
      writeSse(response, "error", { message: event.message })
      return
    case "state":
      writeSse(response, "state", { state: event.state })
      return
    case "text":
      writeSse(response, "text", { text: event.text })
      return
  }
}

export function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }

  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`
}

export function writeChatRunRecap(response: Response, recap: ChatRunRecap) {
  writeMetadata(response, "metadata", {
    detail: `${recap.responseLength}文字 / ${formatDuration(recap.durationMs)} / ${
      recap.emotion?.emotion ?? "neutral"
    } / MemKraft ${recap.memKraftPersisted ? "ok" : "skip"} / Artifacts ${recap.characterMemoryPersisted ? "ok" : "skip"}`,
    label: "今回の返答サマリー",
    raw: recap,
    status: recap.status === "error" ? "error" : recap.status === "aborted" ? "cancelled" : "done",
  })
}
