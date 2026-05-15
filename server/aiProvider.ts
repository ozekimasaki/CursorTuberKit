import type { ChatMetadataPayload, ChatProvider } from "../shared/chatStream.js"
import type { StreamAiResponseOptions } from "./aiCommon.js"

const DEFAULT_CURSOR_MODEL = "composer-2"
const DEFAULT_CURSOR_CHARACTER_AGENT_MODEL = DEFAULT_CURSOR_MODEL
const DEFAULT_CURSOR_EMOTION_MODEL = "composer-2"
const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite-preview"

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

  if (provider === "cursor" || provider === "gemini") {
    return provider
  }

  throw new AiConfigurationError("AI_PROVIDER は cursor または gemini を明示的に指定してください。")
}

export function resolveAiMetadata(provider = readAiProvider()): ProviderChatMetadata {
  switch (provider) {
    case "cursor": {
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
    case "gemini": {
      const model = readConfiguredModel("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)

      return {
        model: model.value,
        modelSource: model.source,
        provider,
        supportsCharacterSubagents: false,
        supportsProviderEmotion: false,
        supportsProviderSessionReuse: false,
      }
    }
  }
}

export async function validateAiConfiguration(provider = readAiProvider()) {
  switch (provider) {
    case "cursor": {
      const { validateCursorConfiguration } = await import("./cursorAgent.js")
      validateCursorConfiguration()
      return
    }
    case "gemini": {
      const { validateGeminiConfiguration } = await import("./geminiAgent.js")
      validateGeminiConfiguration()
      return
    }
  }
}

export async function streamAiResponse(provider: AiProvider, options: StreamAiResponseOptions) {
  switch (provider) {
    case "cursor": {
      const { streamCursorResponse } = await import("./cursorAgent.js")
      return streamCursorResponse(options)
    }
    case "gemini": {
      const { streamGeminiResponse } = await import("./geminiAgent.js")
      return streamGeminiResponse(options)
    }
  }
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
