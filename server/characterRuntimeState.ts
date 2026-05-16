import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  characterSinNames,
  characterStateSchemaVersion,
  clampCharacterSinValue,
  normalizeCharacterSinValues,
  type CharacterSinName,
  type CharacterSinValues,
} from "../shared/characterState.js"

const CHARACTER_RUNTIME_STATE_FILE = path.resolve(process.cwd(), "memory", "runtime", "character-runtime-state.json")
const RUNTIME_DRIFT_BLEND_FACTOR = 0.35
const RUNTIME_DRIFT_MAX_STEP = 12

type CharacterRuntimeStateSource = "hook-stop" | "settings-save"

type CharacterRuntimeState = {
  schemaVersion: typeof characterStateSchemaVersion
  sins: CharacterSinValues
  source: CharacterRuntimeStateSource
  updatedAt: string
}

let cachedRuntimeState: CharacterRuntimeState | null = null
let runtimeStateWriteQueue = Promise.resolve()

export async function readCharacterRuntimeSinValues(
  fallback?: Partial<Record<CharacterSinName, number>>,
): Promise<CharacterSinValues> {
  const state = await readCharacterRuntimeState(fallback)
  return copyCharacterSinValues(state.sins)
}

export async function resetCharacterRuntimeSinValues(
  baseSins?: Partial<Record<CharacterSinName, number>>,
): Promise<CharacterSinValues> {
  const state = createRuntimeState(normalizeCharacterSinValues(baseSins), "settings-save")
  await persistCharacterRuntimeState(state)
  return copyCharacterSinValues(state.sins)
}

export async function updateCharacterRuntimeSinValuesFromHook(
  targetSins: Partial<Record<CharacterSinName, number>>,
  fallbackBaseSins?: Partial<Record<CharacterSinName, number>>,
): Promise<CharacterSinValues> {
  const current = await readCharacterRuntimeState(fallbackBaseSins)
  const nextSins = blendCharacterSinValues(current.sins, normalizeCharacterSinValues(targetSins))
  const state = createRuntimeState(nextSins, "hook-stop")
  await persistCharacterRuntimeState(state)
  return copyCharacterSinValues(state.sins)
}

async function readCharacterRuntimeState(
  fallback?: Partial<Record<CharacterSinName, number>>,
): Promise<CharacterRuntimeState> {
  if (cachedRuntimeState) {
    return copyCharacterRuntimeState(cachedRuntimeState)
  }

  try {
    const raw = await readFile(CHARACTER_RUNTIME_STATE_FILE, "utf8")
    cachedRuntimeState = normalizeCharacterRuntimeState(JSON.parse(raw), fallback)
  } catch {
    cachedRuntimeState = createRuntimeState(normalizeCharacterSinValues(fallback), "settings-save")
    await writeCharacterRuntimeStateFile(cachedRuntimeState)
  }

  return copyCharacterRuntimeState(cachedRuntimeState)
}

async function persistCharacterRuntimeState(state: CharacterRuntimeState) {
  cachedRuntimeState = copyCharacterRuntimeState(state)
  runtimeStateWriteQueue = runtimeStateWriteQueue.then(() => writeCharacterRuntimeStateFile(state))
  await runtimeStateWriteQueue
  return copyCharacterRuntimeState(state)
}

async function writeCharacterRuntimeStateFile(state: CharacterRuntimeState) {
  await mkdir(path.dirname(CHARACTER_RUNTIME_STATE_FILE), { recursive: true })
  const tempFile = `${CHARACTER_RUNTIME_STATE_FILE}.tmp`
  await writeFile(tempFile, `${JSON.stringify(state, null, 2)}\n`, "utf8")
  await rename(tempFile, CHARACTER_RUNTIME_STATE_FILE)
}

function normalizeCharacterRuntimeState(
  input: unknown,
  fallback?: Partial<Record<CharacterSinName, number>>,
): CharacterRuntimeState {
  const candidate = isRecord(input) ? input : null
  const source = candidate?.source === "hook-stop" ? "hook-stop" : "settings-save"
  const updatedAt = typeof candidate?.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString()
  const sins = normalizeCharacterSinValues(isRecord(candidate?.sins) ? candidate.sins : fallback)

  return {
    schemaVersion: characterStateSchemaVersion,
    sins,
    source,
    updatedAt,
  }
}

function createRuntimeState(sins: CharacterSinValues, source: CharacterRuntimeStateSource): CharacterRuntimeState {
  return {
    schemaVersion: characterStateSchemaVersion,
    sins: copyCharacterSinValues(sins),
    source,
    updatedAt: new Date().toISOString(),
  }
}

function blendCharacterSinValues(current: CharacterSinValues, target: CharacterSinValues): CharacterSinValues {
  const next = {} as CharacterSinValues

  for (const name of characterSinNames) {
    const difference = target[name] - current[name]

    if (difference === 0) {
      next[name] = current[name]
      continue
    }

    let step = Math.round(difference * RUNTIME_DRIFT_BLEND_FACTOR)

    if (step === 0) {
      step = difference > 0 ? 1 : -1
    }

    step = Math.max(-RUNTIME_DRIFT_MAX_STEP, Math.min(RUNTIME_DRIFT_MAX_STEP, step))
    next[name] = clampCharacterSinValue(current[name] + step)
  }

  return next
}

function copyCharacterRuntimeState(state: CharacterRuntimeState): CharacterRuntimeState {
  return {
    schemaVersion: state.schemaVersion,
    sins: copyCharacterSinValues(state.sins),
    source: state.source,
    updatedAt: state.updatedAt,
  }
}

function copyCharacterSinValues(sins: CharacterSinValues): CharacterSinValues {
  return {
    envy: sins.envy,
    gluttony: sins.gluttony,
    greed: sins.greed,
    lust: sins.lust,
    pride: sins.pride,
    sloth: sins.sloth,
    wrath: sins.wrath,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
