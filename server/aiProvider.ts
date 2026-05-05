import type { StreamAiResponseOptions } from "./aiCommon.js"

export type AiProvider = "cursor" | "gemini"

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
