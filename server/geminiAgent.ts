import { GoogleGenAI } from "@google/genai"
import type { StreamAiResponseOptions } from "./aiCommon.js"

export class GeminiConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GeminiConfigurationError"
  }
}

export function validateGeminiConfiguration() {
  if (!process.env.GOOGLE_API_KEY?.trim()) {
    throw new GeminiConfigurationError(
      "GOOGLE_API_KEY が未設定です。.env または環境変数に Gemini API キーを設定してください。",
    )
  }

  if (process.env.GEMINI_MODEL !== undefined && !process.env.GEMINI_MODEL.trim()) {
    throw new GeminiConfigurationError("GEMINI_MODEL を指定する場合は空文字以外で設定してください。")
  }
}

export async function streamGeminiResponse({ compiledPrompt, onText, signal }: StreamAiResponseOptions) {
  validateGeminiConfiguration()

  if (signal.aborted) {
    return
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY!.trim() })
  const response = await ai.models.generateContentStream({
    contents: compiledPrompt,
    model: process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite-preview",
    config: {
      abortSignal: signal,
    },
  })

  for await (const chunk of response) {
    if (signal.aborted) {
      break
    }

    if (chunk.text) {
      onText(chunk.text)
    }
  }
}
