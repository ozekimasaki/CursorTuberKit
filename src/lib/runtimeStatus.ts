import { API_BASE } from "./apiBase"
import type { CharacterSinValues } from "../../shared/characterState"
import type { ChatProvider } from "../../shared/chatStream"
import { createEmptyCharacterRuleStatus, type CharacterRuleStatus } from "../../shared/characterRules"
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
  characterRule?: CharacterRuleStatus
  characterStateCurrent?: CharacterSinValues | null
  chatRuns: {
    recent: ChatRunRecap[]
  }
}

export function normalizeCharacterRuleStatus(value: RuntimeStatusSnapshot["characterRule"]): CharacterRuleStatus {
  if (!value) {
    return createEmptyCharacterRuleStatus()
  }

  return {
    contentLength: typeof value.contentLength === "number" ? value.contentLength : 0,
    error: typeof value.error === "string" ? value.error : null,
    loaded: value.loaded === true,
    path: typeof value.path === "string" ? value.path : createEmptyCharacterRuleStatus().path,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
  }
}

export async function fetchRuntimeStatus(signal?: AbortSignal) {
  const response = await fetch(`${API_BASE}/api/runtime/status`, signal ? { signal } : undefined)

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
