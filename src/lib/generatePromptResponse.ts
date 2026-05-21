import type {
  AutomationAction,
  AutomationEnvelope,
  ChatAutomationRequest,
} from "../../shared/automation"
import type { ChatMetadataPayload, ChatSessionPayload } from "../../shared/chatStream"
import type { Emotion, FinalEmotionPayload } from "../../shared/emotion"
import type { ModerationAssessment } from "../../shared/moderation"
import { isChatRunRecap, type ChatRunRecap } from "./runtimeStatus"
import { streamAiResponse, type ConversationTurn } from "./streamAi"

export async function generatePromptResponse(
  prompt: string,
  recentTurns: ConversationTurn[],
  signal: AbortSignal,
  automation?: ChatAutomationRequest,
  inputKind: "viewer-comment" | "self-driven" = "viewer-comment",
) {
  let action: AutomationAction | null = null
  let automationEnvelope: AutomationEnvelope | null = null
  let finalEmotion: Emotion | null = null
  let emotionPayload: FinalEmotionPayload | null = null
  let fullResponseText = ""
  let latestRunRecap: ChatRunRecap | null = null
  let moderation: ModerationAssessment | null = null
  let providerMetadata: ChatMetadataPayload | null = null
  let sessionMetadata: ChatSessionPayload | null = null

  for await (const event of streamAiResponse({
    automation,
    inputKind,
    prompt,
    recentTurns,
    signal,
  })) {
    if (event.type === "automation") {
      automationEnvelope = event.payload
      action = event.payload.actions[0] ?? null
    }

    if (event.type === "text") {
      fullResponseText += event.text
    }

    if (event.type === "moderation") {
      moderation = event.payload
    }

    if (event.type === "metadata") {
      providerMetadata = event.payload
    }

    if (event.type === "session") {
      sessionMetadata = event.payload
    }

    if (event.type === "emotion") {
      finalEmotion = event.payload.emotion
      emotionPayload = event.payload
    }

    if (event.type === "meta" && isChatRunRecap(event.meta.raw)) {
      latestRunRecap = event.meta.raw
    }

    if (event.type === "error") {
      throw new Error(event.message)
    }
  }

  const normalizedResponse = fullResponseText.trim()

  if (!normalizedResponse) {
    throw new Error("AI から空の応答が返りました。")
  }

  return {
    action,
    automationEnvelope,
    emotionPayload,
    finalEmotion,
    latestRunRecap,
    moderation,
    providerMetadata,
    responseText: normalizedResponse,
    sessionMetadata,
  }
}
