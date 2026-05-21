import type {
  PersonaAutoRewriteRequestBody,
  PersonaAutoRewriteResponse,
} from "../../shared/personaCurator"

export async function requestPersonaAutoRewrite(
  body: PersonaAutoRewriteRequestBody,
  signal?: AbortSignal,
): Promise<PersonaAutoRewriteResponse> {
  const response = await fetch("/api/character/auto-rewrite", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal,
  })

  if (!response.ok) {
    let message = "AI 自動更新に失敗しました。"
    try {
      const data = (await response.json()) as { error?: unknown }
      if (data && typeof data.error === "string") message = data.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  return (await response.json()) as PersonaAutoRewriteResponse
}
