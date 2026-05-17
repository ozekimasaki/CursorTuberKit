import type { CursorPromptMode } from "../shared/cursorPrompt.js"

export type CursorTokenUsage = {
  cacheReadTokens: number
  cacheWriteTokens: number
  inputTokens: number
  outputTokens: number
}

export type CursorRunStage = "character-artifacts" | "emotion-drift" | "main-reply"

export type CursorToolCallTelemetry = {
  name: string
  status: string
  truncated: boolean
}

export type CursorRunTelemetryRecord = {
  browserSessionId: string
  durationMs: number
  error: string | null
  finishedAt: string
  model: string
  promptLength?: number
  promptMode?: CursorPromptMode
  providerSessionId?: string
  requestRunId?: string
  resumedAgent?: boolean
  reusedAgent?: boolean
  sdkRunId: string
  stage: CursorRunStage
  startedAt: string
  status: string
  statusHistory: string[]
  toolCalls: CursorToolCallTelemetry[]
  usage: CursorTokenUsage | null
}
