import type { CharacterSinValues } from "../../shared/characterState"
import type { ChatProvider } from "../../shared/chatStream"
import type { FinalEmotionPayload } from "../../shared/emotion"

export type ChatRunRecap = {
  durationMs: number
  emotion: FinalEmotionPayload | null
  error: string | null
  finishedAt: string
  id: string
  memKraftPersisted: boolean
  promptLength: number
  provider: ChatProvider
  recentTurnsCount: number
  responseLength: number
  responsePreview: string
  startedAt: string
  status: "aborted" | "completed" | "error"
}

export type RuntimeStatusSnapshot = {
  characterStateCurrent?: CharacterSinValues | null
  chatRuns: {
    recent: ChatRunRecap[]
  }
}

export async function fetchRuntimeStatus(signal?: AbortSignal) {
  const response = await fetch("/api/runtime/status", signal ? { signal } : undefined)

  if (!response.ok) {
    throw new Error(`runtime status fetch failed: ${response.status}`)
  }

  return (await response.json()) as RuntimeStatusSnapshot
}

export function isChatRunRecap(value: unknown): value is ChatRunRecap {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.provider === "string" &&
    typeof value.responseLength === "number" &&
    typeof value.responsePreview === "string" &&
    typeof value.durationMs === "number" &&
    typeof value.promptLength === "number" &&
    typeof value.recentTurnsCount === "number" &&
    typeof value.memKraftPersisted === "boolean" &&
    typeof value.startedAt === "string" &&
    typeof value.finishedAt === "string" &&
    (value.error === null || typeof value.error === "string") &&
    (value.status === "aborted" || value.status === "completed" || value.status === "error")
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
