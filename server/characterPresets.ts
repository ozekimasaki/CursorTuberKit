import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  maxCharacterPresetCount,
  normalizeCharacterPreset,
  normalizeCharacterPresetInput,
  normalizeCharacterPresets,
  type CharacterPreset,
  type CharacterPresetInput,
} from "../shared/characterPresets.js"

const CHARACTER_PRESETS_FILE = path.resolve(process.cwd(), "memory", "runtime", "character-presets.json")

let cachedPresets: CharacterPreset[] | null = null
let presetsWriteQueue = Promise.resolve()

export async function readCharacterPresets(): Promise<CharacterPreset[]> {
  if (cachedPresets) {
    return copyCharacterPresets(cachedPresets)
  }

  try {
    const raw = await readFile(CHARACTER_PRESETS_FILE, "utf8")
    cachedPresets = normalizeCharacterPresets(JSON.parse(raw))
  } catch {
    cachedPresets = []
    await writeCharacterPresetsFile(cachedPresets)
  }

  return copyCharacterPresets(cachedPresets)
}

export async function createCharacterPreset(input: CharacterPresetInput): Promise<CharacterPreset> {
  const normalized = normalizeCharacterPresetInput(input)

  if (!normalized) {
    throw new Error("Invalid character preset input.")
  }

  const current = await readCharacterPresets()

  if (current.length >= maxCharacterPresetCount) {
    throw new Error(`Character presets are limited to ${maxCharacterPresetCount} items.`)
  }

  const preset = normalizeCharacterPreset({
    id: randomUUID(),
    ...normalized,
  })

  if (!preset) {
    throw new Error("Failed to normalize character preset.")
  }

  const next = [...current, preset]
  await persistCharacterPresets(next)
  return copyCharacterPreset(preset)
}

export async function updateCharacterPreset(presetId: string, input: CharacterPresetInput): Promise<CharacterPreset | null> {
  const normalized = normalizeCharacterPresetInput(input)

  if (!normalized) {
    throw new Error("Invalid character preset input.")
  }

  const current = await readCharacterPresets()
  const presetIndex = current.findIndex((preset) => preset.id === presetId)

  if (presetIndex < 0) {
    return null
  }

  const nextPreset = normalizeCharacterPreset({
    id: presetId,
    ...normalized,
  })

  if (!nextPreset) {
    throw new Error("Failed to normalize character preset.")
  }

  const next = current.map((preset, index) => (index === presetIndex ? nextPreset : preset))
  await persistCharacterPresets(next)
  return copyCharacterPreset(nextPreset)
}

export async function deleteCharacterPreset(presetId: string): Promise<boolean> {
  const current = await readCharacterPresets()
  const next = current.filter((preset) => preset.id !== presetId)

  if (next.length === current.length) {
    return false
  }

  await persistCharacterPresets(next)
  return true
}

async function persistCharacterPresets(presets: CharacterPreset[]) {
  cachedPresets = copyCharacterPresets(presets)
  presetsWriteQueue = presetsWriteQueue.then(() => writeCharacterPresetsFile(presets))
  await presetsWriteQueue
  return copyCharacterPresets(presets)
}

async function writeCharacterPresetsFile(presets: CharacterPreset[]) {
  await mkdir(path.dirname(CHARACTER_PRESETS_FILE), { recursive: true })
  const tempFile = `${CHARACTER_PRESETS_FILE}.tmp`
  await writeFile(tempFile, `${JSON.stringify(presets, null, 2)}\n`, "utf8")
  await rename(tempFile, CHARACTER_PRESETS_FILE)
}

function copyCharacterPresets(presets: CharacterPreset[]) {
  return presets.map(copyCharacterPreset)
}

function copyCharacterPreset(preset: CharacterPreset): CharacterPreset {
  return {
    id: preset.id,
    label: preset.label,
    characterName: preset.characterName,
    characterPrompt: preset.characterPrompt,
    schemaVersion: preset.schemaVersion,
  }
}
