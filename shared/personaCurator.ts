import type { ChatSettings } from "./chatSettings.js"
import type { CharacterSinValues } from "./characterState.js"

export type PersonaCuratorTurn = {
  role: "assistant" | "user"
  text: string
}

export type PersonaAutoRewriteRequestBody = {
  recentTurns: PersonaCuratorTurn[]
  runtimeSins?: CharacterSinValues
}

export type PersonaAutoRewriteResponse = {
  settings: ChatSettings
  summary: string
  updatedAt: string
}
