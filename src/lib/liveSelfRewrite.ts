import { API_BASE } from "./apiBase"

export type LiveMutationRequest = {
  cueText?: string
  cueEmotion?: string
}

export type HeavyMutationRequest = {
  cueText?: string
}

export type MutationResponse = {
  settings: {
    characterPrompt: string
    characterFullPrompt: string
  }
  summary: string
  monologue: string
  visualEffect: "none" | "glitch" | "hue_shift" | "intense"
  updatedAt: string
}

export async function requestLiveMutation(
  request: LiveMutationRequest,
  signal?: AbortSignal,
): Promise<MutationResponse> {
  const response = await fetch(`${API_BASE}/api/character/live-rewrite`, {
    body: JSON.stringify(request),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({ error: "ライブ変異に失敗しました。" }))) as { error?: string }
    throw new Error(body.error || `ライブ変異に失敗しました。HTTP ${response.status}`)
  }

  return (await response.json()) as MutationResponse
}

export async function requestHeavyMutation(
  request: HeavyMutationRequest,
  signal?: AbortSignal,
): Promise<MutationResponse> {
  const response = await fetch(`${API_BASE}/api/character/heavy-rewrite`, {
    body: JSON.stringify(request),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({ error: "重量変異に失敗しました。" }))) as { error?: string }
    throw new Error(body.error || `重量変異に失敗しました。HTTP ${response.status}`)
  }

  return (await response.json()) as MutationResponse
}
