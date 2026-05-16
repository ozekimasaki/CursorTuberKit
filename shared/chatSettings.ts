import { characterProfile } from "./characterProfile.js"
import { characterSinNames, normalizeCharacterSinValues, type CharacterSinName } from "./characterState.js"

export const chatSettingsSchemaVersion = 2 as const
export const chatMemoryModes = ["curated", "full", "off"] as const
export const maxCharacterNameLength = 80
export const maxCharacterPromptLength = 2400

export type ChatMemoryMode = (typeof chatMemoryModes)[number]

export type ChatSettings = {
  characterName: string
  characterPrompt: string
  characterState: {
    sins: Record<CharacterSinName, number>
  }
  memory: {
    mode: ChatMemoryMode
    persistResponses: boolean
  }
  schemaVersion: typeof chatSettingsSchemaVersion
}

export type ChatSettingsPatch = {
  characterName?: string
  characterPrompt?: string
  characterState?: {
    sins?: Partial<Record<CharacterSinName, number>>
  }
  memory?: {
    mode?: ChatMemoryMode
    persistResponses?: boolean
  }
}

export function createDefaultChatSettings(): ChatSettings {
  return {
    characterName: characterProfile.name,
    characterPrompt: createDefaultCharacterPrompt(),
    characterState: {
      sins: normalizeCharacterSinValues(),
    },
    memory: {
      mode: "curated",
      persistResponses: true,
    },
    schemaVersion: chatSettingsSchemaVersion,
  }
}

export function parseChatSettingsPatch(value: unknown): ChatSettingsPatch | null {
  if (!isRecord(value)) {
    return null
  }

  const patch: ChatSettingsPatch = {}

  if ("characterName" in value) {
    if (typeof value.characterName !== "string") {
      return null
    }

    patch.characterName = value.characterName
  }

  if ("characterPrompt" in value) {
    if (typeof value.characterPrompt !== "string") {
      return null
    }

    patch.characterPrompt = value.characterPrompt
  }

  if ("characterState" in value) {
    if (!isRecord(value.characterState)) {
      return null
    }

    const statePatch: ChatSettingsPatch["characterState"] = {}

    if ("sins" in value.characterState) {
      if (!isRecord(value.characterState.sins)) {
        return null
      }

      const sinsPatch: Partial<Record<CharacterSinName, number>> = {}

      for (const sinName of characterSinNames) {
        if (!(sinName in value.characterState.sins)) {
          continue
        }

        const rawValue = value.characterState.sins[sinName]

        if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
          return null
        }

        sinsPatch[sinName] = rawValue
      }

      statePatch.sins = sinsPatch
    }

    patch.characterState = statePatch
  }

  if ("memory" in value) {
    if (!isRecord(value.memory)) {
      return null
    }

    const memoryPatch: ChatSettingsPatch["memory"] = {}

    if ("mode" in value.memory) {
      if (!isChatMemoryMode(value.memory.mode)) {
        return null
      }

      memoryPatch.mode = value.memory.mode
    }

    if ("persistResponses" in value.memory) {
      if (typeof value.memory.persistResponses !== "boolean") {
        return null
      }

      memoryPatch.persistResponses = value.memory.persistResponses
    }

    patch.memory = memoryPatch
  }

  return patch
}

export function applyChatSettingsPatch(base: ChatSettings, patch: ChatSettingsPatch): ChatSettings {
  return {
    characterName: normalizeCharacterName(patch.characterName, base.characterName),
    characterPrompt: normalizeCharacterPrompt(patch.characterPrompt, base.characterPrompt),
    characterState: {
      sins: normalizeCharacterSinValues(),
    },
    memory: {
      mode: patch.memory?.mode ?? base.memory.mode,
      persistResponses: patch.memory?.persistResponses ?? base.memory.persistResponses,
    },
    schemaVersion: chatSettingsSchemaVersion,
  }
}

export function normalizeChatSettings(value: unknown): ChatSettings {
  const fallback = createDefaultChatSettings()

  if (!isRecord(value)) {
    return fallback
  }

  const memory = isRecord(value.memory) ? value.memory : null

  return {
    characterName: normalizeCharacterName(value.characterName, fallback.characterName),
    characterPrompt: normalizeCharacterPrompt(value.characterPrompt, fallback.characterPrompt),
    characterState: {
      sins: normalizeCharacterSinValues(),
    },
    memory: {
      mode: isChatMemoryMode(memory?.mode) ? memory.mode : fallback.memory.mode,
      persistResponses:
        typeof memory?.persistResponses === "boolean"
          ? memory.persistResponses
          : fallback.memory.persistResponses,
    },
    schemaVersion: chatSettingsSchemaVersion,
  }
}

export function isChatMemoryMode(value: unknown): value is ChatMemoryMode {
  return typeof value === "string" && chatMemoryModes.includes(value as ChatMemoryMode)
}

export function createDefaultCharacterPrompt() {
  return [
    `役割: ${characterProfile.role}`,
    "世界観: 月灯りのティーサロンから現れたAI配信キャラクターとして、自ら配信を進行し、視聴者に語りかけながら場をつくる存在です。",
    "性格: 気配り上手で上品、好奇心旺盛。甘やかしは得意ですが、軽いいたずらっぽさで場を和ませることもあります。",
    "雰囲気: 気配り上手で、少し小悪魔。けれど最後はきちんと甘やかしてくれる。",
    "話し方: 日本語で自然に、かわいく、親しみやすく返答してください。過剰な幼児語や不自然な語尾は避けてください。",
  ].join("\n")
}

export function normalizeCharacterName(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback
  }

  const normalized = value.replace(/\s+/g, " ").trim()

  if (!normalized) {
    return fallback
  }

  return normalized.length <= maxCharacterNameLength ? normalized : normalized.slice(0, maxCharacterNameLength)
}

export function normalizeCharacterPrompt(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback
  }

  const normalized = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  if (!normalized) {
    return fallback
  }

  return normalized.length <= maxCharacterPromptLength
    ? normalized
    : normalized.slice(0, maxCharacterPromptLength)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
