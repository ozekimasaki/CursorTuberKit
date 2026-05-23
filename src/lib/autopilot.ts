import { API_BASE } from "./apiBase"
import type { AutopilotTopicRequestBody, AutopilotTopicResponse } from "../../shared/autopilot"

export async function requestAutopilotTopic(
  body: AutopilotTopicRequestBody,
  signal?: AbortSignal,
): Promise<AutopilotTopicResponse> {
  const response = await fetch(`${API_BASE}/api/autopilot/topic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null)
    const message =
      errorPayload && typeof errorPayload === "object" && typeof (errorPayload as { error?: unknown }).error === "string"
        ? (errorPayload as { error: string }).error
        : `autopilot topic request failed (${response.status})`
    throw new Error(message)
  }

  return (await response.json()) as AutopilotTopicResponse
}
