import {
  applyChatSettingsPatch,
  type ChatSettings,
  type ChatSettingsPatch,
} from "../shared/chatSettings.js"
import { readAppSettings, updateAppSettings } from "./appSettings.js"
import { readCharacterRuleSource } from "./characterRuleSource.js"

export async function readChatSettings(): Promise<ChatSettings> {
  const settings = await readAppSettings()
  return applyCharacterRulePrompts(settings.chatSettings)
}

export async function updateChatSettings(patch: ChatSettingsPatch): Promise<ChatSettings> {
  const current = await readChatSettings()
  const next = applyChatSettingsPatch(current, patch)
  const saved = await updateAppSettings({ chatSettings: next })
  return copyChatSettings(saved.chatSettings)
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
