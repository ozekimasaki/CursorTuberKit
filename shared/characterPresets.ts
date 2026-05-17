import {
  createDefaultChatSettings,
  isAccidentalMeiDraftPrompt,
  maxCharacterFullPromptLength,
  maxCharacterNameLength,
  maxCharacterPromptLength,
  normalizeCharacterFullPrompt,
  normalizeCharacterName,
  normalizeCharacterPrompt,
  type ChatSettings,
} from "./chatSettings.js"

export const characterPresetSchemaVersion = 2 as const
export const maxCharacterPresetCount = 24
export const maxCharacterPresetLabelLength = 60

export type CharacterPreset = {
  id: string
  label: string
  characterFullPrompt: string
  characterName: string
  characterPrompt: string
  schemaVersion: typeof characterPresetSchemaVersion
}

export type CharacterPresetInput = {
  label: string
  characterFullPrompt: string
  characterName: string
  characterPrompt: string
}

export function parseCharacterPresetInput(value: unknown): CharacterPresetInput | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    typeof value.label !== "string" ||
    typeof value.characterFullPrompt !== "string" ||
    typeof value.characterName !== "string" ||
    typeof value.characterPrompt !== "string"
  ) {
    return null
  }

  return {
    label: value.label,
    characterFullPrompt: value.characterFullPrompt,
    characterName: value.characterName,
    characterPrompt: value.characterPrompt,
  }
}

export function normalizeCharacterPreset(input: CharacterPresetInput & { id: string }): CharacterPreset | null {
  const defaults = createDefaultChatSettings()
  const id = normalizePresetId(input.id)
  const label = normalizePresetLabel(input.label)

  if (!id || !label) {
    return null
  }

  return {
    id,
    label,
    characterFullPrompt: normalizeCharacterFullPrompt(input.characterFullPrompt, defaults.characterFullPrompt),
    characterName: normalizeCharacterName(input.characterName, defaults.characterName),
    characterPrompt: normalizeCharacterPrompt(input.characterPrompt, defaults.characterPrompt),
    schemaVersion: characterPresetSchemaVersion,
  }
}

export function normalizeCharacterPresetInput(input: CharacterPresetInput): CharacterPresetInput | null {
  const defaults = createDefaultChatSettings()
  const label = normalizePresetLabel(input.label)

  if (!label) {
    return null
  }

  return {
    label,
    characterFullPrompt: normalizeCharacterFullPrompt(input.characterFullPrompt, defaults.characterFullPrompt),
    characterName: normalizeCharacterName(input.characterName, defaults.characterName),
    characterPrompt: normalizeCharacterPrompt(input.characterPrompt, defaults.characterPrompt),
  }
}

export function normalizeCharacterPresets(value: unknown): CharacterPreset[] {
  if (!Array.isArray(value)) {
    return []
  }

  const defaults = createDefaultChatSettings()
  const presets: CharacterPreset[] = []

  for (const item of value) {
    if (!isRecord(item)) {
      continue
    }

    const preset = normalizeCharacterPreset({
      id: typeof item.id === "string" ? item.id : "",
      label: typeof item.label === "string" ? item.label : "",
      characterFullPrompt:
        typeof item.characterFullPrompt === "string" ? item.characterFullPrompt : defaults.characterFullPrompt,
      characterName: typeof item.characterName === "string" ? item.characterName : "",
      characterPrompt: typeof item.characterPrompt === "string" ? item.characterPrompt : "",
    })

    if (preset) {
      presets.push(repairAccidentalCatlinPreset(preset, defaults))
    }
  }

  return presets.slice(0, maxCharacterPresetCount)
}

function repairAccidentalCatlinPreset(preset: CharacterPreset, defaults: ChatSettings): CharacterPreset {
  const isCatlinPreset = preset.label === defaults.characterName || preset.characterName === defaults.characterName

  if (!isCatlinPreset || !isAccidentalMeiDraftPrompt(preset.characterPrompt)) {
    return preset
  }

  return {
    ...preset,
    characterFullPrompt: defaults.characterFullPrompt,
    characterName: defaults.characterName,
    characterPrompt: defaults.characterPrompt,
  }
}

function normalizePresetId(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim()
  return normalized ? normalized : null
}

export function normalizePresetLabel(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.replace(/\s+/g, " ").trim()

  if (!normalized) {
    return null
  }

  return normalized.length <= maxCharacterPresetLabelLength
    ? normalized
    : normalized.slice(0, maxCharacterPresetLabelLength)
}

export function describeCharacterPresetValidation() {
  return `label, characterName, characterPrompt, characterFullPrompt を正しく指定してください。label は 1-${maxCharacterPresetLabelLength} 文字、characterName は最大 ${maxCharacterNameLength} 文字、characterPrompt は最大 ${maxCharacterPromptLength} 文字、characterFullPrompt は最大 ${maxCharacterFullPromptLength} 文字です。`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
