import type { FinalEmotionPayload } from "./emotion.js"
import type { CharacterArtifactsPayload } from "./characterAgents.js"
import type { CharacterStateMetadata } from "./characterState.js"

export const chatProviders = ["cursor", "gemini"] as const
export type ChatProvider = (typeof chatProviders)[number]

export const chatStreamStates = ["thinking", "speaking", "done"] as const
export type ChatStreamState = (typeof chatStreamStates)[number]

export const chatActionKinds = ["character-agents", "emotion-finalize", "memory-persist"] as const
export type ChatActionKind = (typeof chatActionKinds)[number]

export const chatActionStatuses = ["started", "completed", "failed", "fallback", "skipped"] as const
export type ChatActionStatus = (typeof chatActionStatuses)[number]

export type ChatSessionPayload = {
  browserSessionId: string
  characterStateSignature?: string
  provider: ChatProvider
  providerSessionId?: string
  runId?: string
  transport: "cookie"
  supportsResume: boolean
  reusedAgent?: boolean
  resumedAgent?: boolean
  continuedFromRunId?: string
}

export type ChatMetadataPayload = {
  characterAgentModel?: string
  characterAgentModelSource?: "default" | "env"
  characterState: CharacterStateMetadata
  provider: ChatProvider
  model: string
  modelSource: "default" | "env"
  emotionModel?: string
  emotionModelSource?: "default" | "env"
  supportsCharacterSubagents: boolean
  supportsProviderEmotion: boolean
  supportsProviderSessionReuse: boolean
}

export type ChatActionPayload = {
  detail?: string
  kind: ChatActionKind
  provider: ChatProvider
  source?: FinalEmotionPayload["source"]
  status: ChatActionStatus
}

export type ChatStreamEvent =
  | { type: "action"; payload: ChatActionPayload }
  | { type: "character-artifacts"; payload: CharacterArtifactsPayload }
  | { type: "done" }
  | { type: "emotion"; payload: FinalEmotionPayload }
  | { type: "error"; message: string }
  | { type: "metadata"; payload: ChatMetadataPayload }
  | { type: "session"; payload: ChatSessionPayload }
  | { type: "state"; state: ChatStreamState }
  | { type: "text"; text: string }

export function isChatProvider(value: unknown): value is ChatProvider {
  return typeof value === "string" && chatProviders.includes(value as ChatProvider)
}

export function isChatStreamState(value: unknown): value is ChatStreamState {
  return typeof value === "string" && chatStreamStates.includes(value as ChatStreamState)
}

export function isChatActionKind(value: unknown): value is ChatActionKind {
  return typeof value === "string" && chatActionKinds.includes(value as ChatActionKind)
}

export function isChatActionStatus(value: unknown): value is ChatActionStatus {
  return typeof value === "string" && chatActionStatuses.includes(value as ChatActionStatus)
}
