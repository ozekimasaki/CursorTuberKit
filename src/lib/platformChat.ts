import { API_BASE } from "./apiBase"
import type {
  PlatformChatMode,
  PlatformChatStateResponse,
} from "../../shared/platformChat"

type StartPlatformChatRequest = {
  mode: PlatformChatMode
  target: string
}

export async function fetchPlatformChatState(signal?: AbortSignal): Promise<PlatformChatStateResponse> {
  const response = await fetch(`${API_BASE}/api/platform-chat/state`, { signal })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "配信コメント状態の取得に失敗しました。"))
  }

  return (await response.json()) as PlatformChatStateResponse
}

export async function startPlatformChat(
  body: StartPlatformChatRequest,
  signal?: AbortSignal,
): Promise<PlatformChatStateResponse> {
  const response = await fetch(`${API_BASE}/api/platform-chat/start`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "配信コメント接続の開始に失敗しました。"))
  }

  return (await response.json()) as PlatformChatStateResponse
}

export async function stopPlatformChat(signal?: AbortSignal): Promise<PlatformChatStateResponse> {
  const response = await fetch(`${API_BASE}/api/platform-chat/stop`, {
    method: "POST",
    signal,
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "配信コメント接続の停止に失敗しました。"))
  }

  return (await response.json()) as PlatformChatStateResponse
}

async function readErrorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get("Content-Type") ?? ""

  if (contentType.includes("application/json")) {
    const body = (await response.json()) as unknown

    if (isRecord(body) && typeof body.error === "string") {
      return body.error
    }
  }

  const text = await response.text()
  return text || fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
