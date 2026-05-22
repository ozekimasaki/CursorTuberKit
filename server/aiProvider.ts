import type { ChatMetadataPayload, ChatProvider } from "../shared/chatStream.js"
import type { StreamAiResponseOptions } from "./aiCommon.js"
import { readAppConfig } from "./appConfig.js"

export type AiProvider = ChatProvider
export type ProviderChatMetadata = Omit<ChatMetadataPayload, "characterState">

export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AiConfigurationError"
  }
}

export function readAiProvider(): AiProvider {
  return "cursor"
}

export function resolveAiMetadata(provider = readAiProvider()): ProviderChatMetadata {
  const config = readAppConfig()

  return {
    characterAgentModel: config.cursor.characterModel,
    characterAgentModelSource: "config",
    emotionModel: config.cursor.emotionModel,
    emotionModelSource: "config",
    model: config.cursor.model,
    modelSource: "config",
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
