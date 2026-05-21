import type { ChatMetadataPayload, ChatProvider } from "../shared/chatStream.js"
import type { StreamAiResponseOptions } from "./aiCommon.js"

const DEFAULT_CURSOR_MODEL = "composer-2.5"
const DEFAULT_CURSOR_CHARACTER_AGENT_MODEL = DEFAULT_CURSOR_MODEL
const DEFAULT_CURSOR_EMOTION_MODEL = "composer-2.5"

export type AiProvider = ChatProvider
export type ProviderChatMetadata = Omit<ChatMetadataPayload, "characterState">

export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AiConfigurationError"
  }
}

export function readAiProvider(): AiProvider {
  const provider = process.env.AI_PROVIDER

  if (!provider || provider === "cursor") {
    return "cursor"
  }

  throw new AiConfigurationError("このプロジェクトは現在 Cursor 専用です。AI_PROVIDER は cursor を指定するか省略してください。")
}

export function resolveAiMetadata(provider = readAiProvider()): ProviderChatMetadata {
  const model = readConfiguredModel("CURSOR_MODEL", DEFAULT_CURSOR_MODEL)
  const characterAgentModel = readConfiguredModel("CURSOR_CHARACTER_MODEL", DEFAULT_CURSOR_CHARACTER_AGENT_MODEL)
  const emotionModel = readConfiguredModel("CURSOR_EMOTION_MODEL", DEFAULT_CURSOR_EMOTION_MODEL)

  return {
    characterAgentModel: characterAgentModel.value,
    characterAgentModelSource: characterAgentModel.source,
    emotionModel: emotionModel.value,
    emotionModelSource: emotionModel.source,
    model: model.value,
    modelSource: model.source,
    provider,
    supportsCharacterSubagents: true,
    supportsProviderEmotion: true,
    supportsProviderSessionReuse: true,
  }
}

export async function validateAiConfiguration(provider = readAiProvider()) {
  const { validateCursorConfiguration } = await import("./cursorAgent.js")
  validateCursorConfiguration()
}

export async function streamAiResponse(provider: AiProvider, options: StreamAiResponseOptions) {
  const { streamCursorResponse } = await import("./cursorAgent.js")
  return streamCursorResponse(options)
}

function readConfiguredModel(name: string, fallback: string) {
  const value = process.env[name]?.trim()

  if (value) {
    return {
      source: "env" as const,
      value,
    }
  }

  return {
    source: "default" as const,
    value: fallback,
  }
}
