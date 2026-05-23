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

import { API_BASE } from "./apiBase"

export async function fetchVoicevoxHealth(signal?: AbortSignal): Promise<VoicevoxHealth> {
  const response = await fetch(`${API_BASE}/api/voicevox/health`, { signal })

  if (!response.ok) {
    throw new Error("VOICEVOXの状態確認に失敗しました。")
  }

  return (await response.json()) as VoicevoxHealth
}

export async function fetchVoicevoxSpeakers(signal?: AbortSignal): Promise<VoicevoxSpeakerGroup[]> {
  const response = await fetch(`${API_BASE}/api/voicevox/speakers`, { signal })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  const body = (await response.json()) as { groups?: VoicevoxSpeakerGroup[] }
  return Array.isArray(body.groups) ? body.groups : []
}

export type VoiceMutationRequest = {
  speedDelta?: number
  pitchDelta?: number
  intonationDelta?: number
  speakerId?: number | null
}

export async function synthesizeVoice(text: string, signal: AbortSignal, mutation?: VoiceMutationRequest): Promise<Blob> {
  const response = await fetch(`${API_BASE}/api/voicevox/synthesis`, {
    body: JSON.stringify({ text, mutation }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  })

  if (!response.ok) {
    const message = await readErrorMessage(response)
    throw new Error(message)
  }

  return response.blob()
}

async function readErrorMessage(response: Response) {
  const contentType = response.headers.get("Content-Type") ?? ""

  if (contentType.includes("application/json")) {
    const body = (await response.json()) as unknown

    if (isRecord(body) && typeof body.error === "string") {
      return body.error
    }
  }

  const text = await response.text()
  return text || `VOICEVOXエラーが発生しました。HTTP ${response.status}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
