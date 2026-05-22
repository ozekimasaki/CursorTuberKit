import type { AppSettings } from "../../shared/appSettings"

export async function fetchAppSettings(signal?: AbortSignal): Promise<AppSettings> {
  const response = await fetch("/api/app-settings", { signal })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "設定の取得に失敗しました。"))
  }
  return (await response.json()) as AppSettings
}

export async function saveAppSettings(settings: AppSettings, signal?: AbortSignal): Promise<AppSettings> {
  const response = await fetch("/api/app-settings", {
    body: JSON.stringify(settings),
    headers: {
      "Content-Type": "application/json",
    },
    method: "PUT",
    signal,
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "設定の保存に失敗しました。"))
  }

  return (await response.json()) as AppSettings
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
