import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  applyChatSettingsPatch,
  createDefaultChatSettings,
  normalizeChatSettings,
  type ChatSettings,
  type ChatSettingsPatch,
} from "../shared/chatSettings.js"

const CHAT_SETTINGS_FILE = path.resolve(process.cwd(), "memory", "runtime", "chat-settings.json")

let cachedSettings: ChatSettings | null = null
let settingsWriteQueue = Promise.resolve()

export async function readChatSettings(): Promise<ChatSettings> {
  if (cachedSettings) {
    return copyChatSettings(cachedSettings)
  }

  try {
    const raw = await readFile(CHAT_SETTINGS_FILE, "utf8")
    cachedSettings = normalizeChatSettings(JSON.parse(raw))
  } catch {
    cachedSettings = createDefaultChatSettings()
    await writeChatSettingsFile(cachedSettings)
  }

  return copyChatSettings(cachedSettings)
}

export async function updateChatSettings(patch: ChatSettingsPatch): Promise<ChatSettings> {
  const current = await readChatSettings()
  const next = applyChatSettingsPatch(current, patch)
  return persistChatSettings(next)
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
    schemaVersion: settings.schemaVersion,
  }
}
