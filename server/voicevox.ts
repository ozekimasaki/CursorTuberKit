import type { ChatVoiceSettings } from "../shared/chatSettings.js"
import { readAppConfig } from "./appConfig.js"

type AudioQuery = Record<string, unknown>

export type VoiceMutationOverrides = {
  speedDelta?: number
  pitchDelta?: number
  intonationDelta?: number
  speakerId?: number | null
}

type SynthesizeVoiceOptions = {
  signal: AbortSignal
  text: string
  voice?: ChatVoiceSettings
  mutation?: VoiceMutationOverrides
}

export class VoicevoxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VoicevoxError"
  }
}

export type VoicevoxHealth = {
  ok: boolean
  speaker: number
  url: string
  version: string | null
}

export type VoicevoxSpeakerStyle = {
  id: number
  name: string
  type?: string
}

export type VoicevoxSpeakerGroup = {
  name: string
  speakerUuid: string
  styles: VoicevoxSpeakerStyle[]
}

export async function getVoicevoxHealth(signal?: AbortSignal, voice?: ChatVoiceSettings): Promise<VoicevoxHealth> {
  const url = getVoicevoxUrl()
  const speaker = voice?.speakerId ?? getVoicevoxSpeaker()

  try {
    const response = await fetch(`${url}/version`, { signal })

    if (!response.ok) {
      return { ok: false, speaker, url, version: null }
    }

    const version = (await response.text()).trim().replace(/^"|"$/g, "")
    return { ok: true, speaker, url, version }
  } catch {
    return { ok: false, speaker, url, version: null }
  }
}

export async function synthesizeVoice({ signal, text, voice, mutation }: SynthesizeVoiceOptions): Promise<Buffer> {
  const normalizedText = text.trim()

  if (!normalizedText) {
    throw new VoicevoxError("音声化するテキストがありません。")
  }

  if (normalizedText.length > 1000) {
    throw new VoicevoxError("VOICEVOXで音声化できるテキストは1000文字以下です。")
  }

  const speaker = mutation?.speakerId ?? voice?.speakerId ?? getVoicevoxSpeaker()
  const query = await createAudioQuery(normalizedText, speaker, signal)
  const tunedQuery = tuneAudioQuery(query, voice, mutation)
  const wav = await synthesis(tunedQuery, speaker, signal)
  return Buffer.from(await wav.arrayBuffer())
}

let cachedSpeakers: { fetchedAt: number; groups: VoicevoxSpeakerGroup[] } | null = null
const SPEAKERS_CACHE_TTL_MS = 60_000

export async function fetchVoicevoxSpeakers(signal?: AbortSignal): Promise<VoicevoxSpeakerGroup[]> {
  const now = Date.now()
  if (cachedSpeakers && now - cachedSpeakers.fetchedAt < SPEAKERS_CACHE_TTL_MS) {
    return cachedSpeakers.groups
  }

  const url = `${getVoicevoxUrl()}/speakers`
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new VoicevoxError(await readVoicevoxError(response, "VOICEVOX /speakers の取得に失敗しました。"))
  }

  const raw = (await response.json()) as unknown
  const groups = normalizeSpeakerGroups(raw)
  cachedSpeakers = { fetchedAt: now, groups }
  return groups
}

export function clearVoicevoxSpeakerCache() {
  cachedSpeakers = null
}

function normalizeSpeakerGroups(value: unknown): VoicevoxSpeakerGroup[] {
  if (!Array.isArray(value)) return []
  const groups: VoicevoxSpeakerGroup[] = []

  for (const entry of value) {
    if (!isRecord(entry)) continue
    const name = typeof entry.name === "string" ? entry.name : null
    const speakerUuid = typeof entry.speaker_uuid === "string" ? entry.speaker_uuid : ""
    const stylesRaw = Array.isArray(entry.styles) ? entry.styles : []
    if (!name) continue

    const styles: VoicevoxSpeakerStyle[] = []
    for (const styleRaw of stylesRaw) {
      if (!isRecord(styleRaw)) continue
      const id = styleRaw.id
      const styleName = typeof styleRaw.name === "string" ? styleRaw.name : null
      if (typeof id !== "number" || !Number.isInteger(id) || !styleName) continue
      const type = typeof styleRaw.type === "string" ? styleRaw.type : undefined
      styles.push({ id, name: styleName, type })
    }

    if (styles.length > 0) {
      groups.push({ name, speakerUuid, styles })
    }
  }

  return groups
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getVoicevoxUrl() {
  return readAppConfig().voicevox.url.replace(/\/$/, "")
}

function getVoicevoxSpeaker() {
  const parsed = readAppConfig().voicevox.defaultSpeakerId

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new VoicevoxError("voicevox.defaultSpeakerId は0以上の整数で指定してください。")
  }

  return parsed
}

async function createAudioQuery(text: string, speaker: number, signal: AbortSignal): Promise<AudioQuery> {
  const url = new URL(`${getVoicevoxUrl()}/audio_query`)
  url.searchParams.set("text", text)
  url.searchParams.set("speaker", String(speaker))

  const response = await fetch(url, {
    method: "POST",
    signal,
  })

  if (!response.ok) {
    throw new VoicevoxError(await readVoicevoxError(response, "VOICEVOX audio_query に失敗しました。"))
  }

  return (await response.json()) as AudioQuery
}

async function synthesis(query: AudioQuery, speaker: number, signal: AbortSignal) {
  const url = new URL(`${getVoicevoxUrl()}/synthesis`)
  url.searchParams.set("speaker", String(speaker))
  url.searchParams.set("enable_interrogative_upspeak", "true")

  const response = await fetch(url, {
    body: JSON.stringify(query),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  })

  if (!response.ok) {
    throw new VoicevoxError(await readVoicevoxError(response, "VOICEVOX synthesis に失敗しました。"))
  }

  return response
}

function tuneAudioQuery(query: AudioQuery, voice?: ChatVoiceSettings, mutation?: VoiceMutationOverrides): AudioQuery {
  const baseIntonation = voice?.intonationScale ?? 1.15
  const basePitch = voice?.pitchScale ?? 0.02
  const baseSpeed = voice?.speedScale ?? 1.08
  const baseVolume = voice?.volumeScale ?? 1

  return {
    ...query,
    intonationScale: clampAudioParam(readNumber(query.intonationScale, baseIntonation) + (mutation?.intonationDelta ?? 0), 0, 2),
    pitchScale: clampAudioParam(readNumber(query.pitchScale, basePitch) + (mutation?.pitchDelta ?? 0), -0.15, 0.15),
    speedScale: clampAudioParam(readNumber(query.speedScale, baseSpeed) + (mutation?.speedDelta ?? 0), 0.5, 2),
    volumeScale: readNumber(query.volumeScale, baseVolume),
  }
}

function clampAudioParam(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

async function readVoicevoxError(response: Response, fallback: string) {
  const text = await response.text()
  return text ? `${fallback} ${text}` : fallback
}
