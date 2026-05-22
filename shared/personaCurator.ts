import type { ChatSettings } from "./chatSettings.js"
import type { CharacterSinValues } from "./characterState.js"
import type { CharacterRuleStatus } from "./characterRules.js"

export type PersonaCuratorTurn = {
  role: "assistant" | "user"
  text: string
}

export type PersonaAutoRewriteRequestBody = {
  recentTurns: PersonaCuratorTurn[]
  runtimeSins?: CharacterSinValues
}

export type PersonaAutoRewriteResponse = {
  characterRule: CharacterRuleStatus
  settings: ChatSettings
  summary: string
  updatedAt: string
}
