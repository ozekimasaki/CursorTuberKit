import type { ChatSettings, ChatSettingsPatch } from "../../shared/chatSettings"
import type { CharacterPreset, CharacterPresetInput } from "../../shared/characterPresets"

type ClearChatMemoryResponse = {
  ok: boolean
}

type DeleteCharacterPresetResponse = {
  ok: boolean
}

export async function fetchChatSettings(signal?: AbortSignal): Promise<ChatSettings> {
  const response = await fetch("/api/chat-settings", { signal })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "設定の取得に失敗しました。"))
  }

  return (await response.json()) as ChatSettings
}

export async function updateChatSettings(
  body: ChatSettingsPatch,
  signal?: AbortSignal,
): Promise<ChatSettings> {
  const response = await fetch("/api/chat-settings", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
    method: "PUT",
    signal,
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "設定の保存に失敗しました。"))
  }

  return (await response.json()) as ChatSettings
}

export async function clearChatMemory(signal?: AbortSignal): Promise<ClearChatMemoryResponse> {
  const response = await fetch("/api/chat-settings/memory/clear", {
    method: "POST",
    signal,
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "長期記憶のクリアに失敗しました。"))
  }

  return (await response.json()) as ClearChatMemoryResponse
}

export async function fetchCharacterPresets(signal?: AbortSignal): Promise<CharacterPreset[]> {
  const response = await fetch("/api/chat-settings/presets", { signal })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "プリセットの取得に失敗しました。"))
  }

  return (await response.json()) as CharacterPreset[]
}

export async function createCharacterPreset(
  body: CharacterPresetInput,
  signal?: AbortSignal,
): Promise<CharacterPreset> {
  const response = await fetch("/api/chat-settings/presets", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "プリセットの保存に失敗しました。"))
  }

  return (await response.json()) as CharacterPreset
}

export async function updateCharacterPreset(
  presetId: string,
  body: CharacterPresetInput,
  signal?: AbortSignal,
): Promise<CharacterPreset> {
  const response = await fetch(`/api/chat-settings/presets/${encodeURIComponent(presetId)}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
    method: "PUT",
    signal,
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "プリセットの更新に失敗しました。"))
  }

  return (await response.json()) as CharacterPreset
}

export async function deleteCharacterPreset(
  presetId: string,
  signal?: AbortSignal,
): Promise<DeleteCharacterPresetResponse> {
  const response = await fetch(`/api/chat-settings/presets/${encodeURIComponent(presetId)}`, {
    method: "DELETE",
    signal,
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "プリセットの削除に失敗しました。"))
  }

  return (await response.json()) as DeleteCharacterPresetResponse
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
