import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  applyChatSettingsPatch,
  createDefaultChatSettings,
  normalizeChatSettings,
  type ChatSettings,
  type ChatSettingsPatch,
} from "../shared/chatSettings.js"
import { readCharacterRuleSource } from "./characterRuleSource.js"

const CHAT_SETTINGS_FILE = path.resolve(process.cwd(), "memory", "runtime", "chat-settings.json")

let cachedSettings: ChatSettings | null = null
let settingsWriteQueue = Promise.resolve()

export async function readChatSettings(): Promise<ChatSettings> {
  if (cachedSettings) {
    return applyCharacterRulePrompts(cachedSettings)
  }

  try {
    const raw = await readFile(CHAT_SETTINGS_FILE, "utf8")
    const parsed = JSON.parse(raw) as unknown
    const normalized = normalizeChatSettings(parsed)
    const seeded = seedVoiceFromEnvIfMissing(normalized, parsed)
    cachedSettings = seeded.settings
    if (seeded.shouldPersist) {
      await writeChatSettingsFile(cachedSettings)
    }
  } catch {
    const defaults = createDefaultChatSettings()
    cachedSettings = applyEnvSpeakerSeed(defaults)
    await writeChatSettingsFile(cachedSettings)
  }

  return applyCharacterRulePrompts(cachedSettings)
}

export async function updateChatSettings(patch: ChatSettingsPatch): Promise<ChatSettings> {
  const current = await readChatSettings()
  const next = applyChatSettingsPatch(current, patch)
  return persistChatSettings(next)
}

function seedVoiceFromEnvIfMissing(
  settings: ChatSettings,
  raw: unknown,
): { settings: ChatSettings; shouldPersist: boolean } {
  const hadVoice = isRecord(raw) && isRecord((raw as Record<string, unknown>).voice)
  if (hadVoice) {
    return { settings, shouldPersist: false }
  }

  const seeded = applyEnvSpeakerSeed(settings)
  return { settings: seeded, shouldPersist: true }
}

function applyEnvSpeakerSeed(settings: ChatSettings): ChatSettings {
  const envSpeaker = readEnvSpeakerId()
  if (envSpeaker == null) {
    return settings
  }
  return {
    ...settings,
    voice: { ...settings.voice, speakerId: envSpeaker },
  }
}

function readEnvSpeakerId(): number | null {
  const raw = process.env.VOICEVOX_SPEAKER
  if (raw == null || raw === "") return null
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0) return null
  return parsed
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

async function persistChatSettings(settings: ChatSettings) {
  cachedSettings = copyChatSettings(settings)
  settingsWriteQueue = settingsWriteQueue.then(() => writeChatSettingsFile(settings))
  await settingsWriteQueue
  return copyChatSettings(settings)
}

async function writeChatSettingsFile(settings: ChatSettings) {
  await mkdir(path.dirname(CHAT_SETTINGS_FILE), { recursive: true })
  const tempFile = `${CHAT_SETTINGS_FILE}.tmp`
  await writeFile(tempFile, `${JSON.stringify(settings, null, 2)}\n`, "utf8")
  await rename(tempFile, CHAT_SETTINGS_FILE)
}

function copyChatSettings(settings: ChatSettings): ChatSettings {
  return {
    characterName: settings.characterName,
    characterFullPrompt: settings.characterFullPrompt,
    characterPrompt: settings.characterPrompt,
    characterState: {
      sins: {
        ...settings.characterState.sins,
      },
    },
    memory: {
      mode: settings.memory.mode,
      persistResponses: settings.memory.persistResponses,
    },
    voice: { ...settings.voice },
    schemaVersion: settings.schemaVersion,
  }
}

async function applyCharacterRulePrompts(settings: ChatSettings): Promise<ChatSettings> {
  const copied = copyChatSettings(settings)
  const source = await readCharacterRuleSource()

  return {
    ...copied,
    characterFullPrompt: source.characterFullPrompt ?? copied.characterFullPrompt,
    characterPrompt: source.characterPrompt ?? copied.characterPrompt,
  }
}
