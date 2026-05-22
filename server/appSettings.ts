import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  applyAppSettingsPatch,
  createDefaultAppSettings,
  normalizeAppSettings,
  type AppSettings,
  type AppSettingsPatch,
} from "../shared/appSettings.js"
import { normalizeChatSettings } from "../shared/chatSettings.js"
import { readAppConfig } from "./appConfig.js"

const APP_SETTINGS_FILE = path.resolve(process.cwd(), "memory", "runtime", "app-settings.json")
const LEGACY_CHAT_SETTINGS_FILE = path.resolve(process.cwd(), "memory", "runtime", "chat-settings.json")

let cachedSettings: AppSettings | null = null
let settingsWriteQueue = Promise.resolve()

export async function readAppSettings(): Promise<AppSettings> {
  if (cachedSettings) return copyAppSettings(cachedSettings)

  try {
    const raw = await readFile(APP_SETTINGS_FILE, "utf8")
    cachedSettings = normalizeAppSettings(JSON.parse(raw), await createSeededDefaults())
  } catch {
    cachedSettings = await createMigratedDefaults()
    await writeAppSettingsFile(cachedSettings)
  }

  return copyAppSettings(cachedSettings)
}

export async function updateAppSettings(patch: AppSettingsPatch): Promise<AppSettings> {
  const current = await readAppSettings()
  const next = applyAppSettingsPatch(current, patch)
  return persistAppSettings(next)
}

export async function overwriteAppSettings(settings: AppSettings): Promise<AppSettings> {
  return persistAppSettings(normalizeAppSettings(settings, await createSeededDefaults()))
}

async function createMigratedDefaults() {
  const defaults = await createSeededDefaults()
  try {
    const raw = await readFile(LEGACY_CHAT_SETTINGS_FILE, "utf8")
    return createDefaultAppSettings(normalizeChatSettings(JSON.parse(raw)))
  } catch {
    return defaults
  }
}

async function createSeededDefaults() {
  const defaults = createDefaultAppSettings()
  const speakerId = readAppConfig().voicevox.defaultSpeakerId
  return {
    ...defaults,
    chatSettings: {
      ...defaults.chatSettings,
      voice: {
        ...defaults.chatSettings.voice,
        speakerId,
      },
    },
  }
}

async function persistAppSettings(settings: AppSettings) {
  cachedSettings = copyAppSettings(settings)
  settingsWriteQueue = settingsWriteQueue.then(() => writeAppSettingsFile(settings))
  await settingsWriteQueue
  return copyAppSettings(settings)
}

async function writeAppSettingsFile(settings: AppSettings) {
  await mkdir(path.dirname(APP_SETTINGS_FILE), { recursive: true })
  const tempFile = `${APP_SETTINGS_FILE}.tmp`
  await writeFile(tempFile, `${JSON.stringify(settings, null, 2)}\n`, "utf8")
  await rename(tempFile, APP_SETTINGS_FILE)
}

function copyAppSettings(settings: AppSettings): AppSettings {
  return normalizeAppSettings(JSON.parse(JSON.stringify(settings)) as unknown, settings)
}
