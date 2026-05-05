type AudioQuery = Record<string, unknown>

type SynthesizeVoiceOptions = {
  signal: AbortSignal
  text: string
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

export async function getVoicevoxHealth(signal?: AbortSignal): Promise<VoicevoxHealth> {
  const url = getVoicevoxUrl()
  const speaker = getVoicevoxSpeaker()

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

export async function synthesizeVoice({ signal, text }: SynthesizeVoiceOptions): Promise<Buffer> {
  const normalizedText = text.trim()

  if (!normalizedText) {
    throw new VoicevoxError("音声化するテキストがありません。")
  }

  if (normalizedText.length > 1000) {
    throw new VoicevoxError("VOICEVOXで音声化できるテキストは1000文字以下です。")
  }

  const query = await createAudioQuery(normalizedText, signal)
  const tunedQuery = tuneAudioQuery(query)
  const wav = await synthesis(tunedQuery, signal)
  return Buffer.from(await wav.arrayBuffer())
}

function getVoicevoxUrl() {
  return (process.env.VOICEVOX_URL ?? "http://127.0.0.1:50021").replace(/\/$/, "")
}

function getVoicevoxSpeaker() {
  const parsed = Number(process.env.VOICEVOX_SPEAKER ?? 1)

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new VoicevoxError("VOICEVOX_SPEAKER は0以上の整数で指定してください。")
  }

  return parsed
}

async function createAudioQuery(text: string, signal: AbortSignal): Promise<AudioQuery> {
  const url = new URL(`${getVoicevoxUrl()}/audio_query`)
  url.searchParams.set("text", text)
  url.searchParams.set("speaker", String(getVoicevoxSpeaker()))

  const response = await fetch(url, {
    method: "POST",
    signal,
  })

  if (!response.ok) {
    throw new VoicevoxError(await readVoicevoxError(response, "VOICEVOX audio_query に失敗しました。"))
  }

  return (await response.json()) as AudioQuery
}

async function synthesis(query: AudioQuery, signal: AbortSignal) {
  const url = new URL(`${getVoicevoxUrl()}/synthesis`)
  url.searchParams.set("speaker", String(getVoicevoxSpeaker()))
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

function tuneAudioQuery(query: AudioQuery): AudioQuery {
  return {
    ...query,
    intonationScale: readNumber(query.intonationScale, 1.15),
    pitchScale: readNumber(query.pitchScale, 0.02),
    speedScale: readNumber(query.speedScale, 1.08),
    volumeScale: readNumber(query.volumeScale, 1),
  }
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

async function readVoicevoxError(response: Response, fallback: string) {
  const text = await response.text()
  return text ? `${fallback} ${text}` : fallback
}
