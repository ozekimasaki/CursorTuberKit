import type { AutopilotDiscoverySnippet } from "../../shared/autopilot.js"
import { getCached } from "./cache.js"

const FETCH_TIMEOUT_MS = 3000
const CACHE_TTL_MS = 30_000
const MAX_SNIPPETS_PER_ENDPOINT = 3
const MAX_TOTAL_SNIPPETS = 6

/**
 * Calls one or more MCP-compatible discovery endpoints.
 *
 * Endpoints are configured via either:
 *   - `MCP_DISCOVERY_URLS` (comma-separated list, recommended)
 *   - `MCP_DISCOVERY_URL`  (single URL, legacy, still honored)
 *
 * Both are merged and de-duplicated. The shared `MCP_DISCOVERY_TOKEN`
 * is applied as a Bearer token to all endpoints.
 *
 * Each endpoint is expected to accept POST with `{ topic?: string }` and
 * respond with `{ snippets: [{ title, detail }] }`. Failures yield [].
 */
export async function fetchMcpDiscoverySnippets(topic: string | null): Promise<AutopilotDiscoverySnippet[]> {
  const urls = resolveEndpointUrls()
  if (urls.length === 0) {
    return []
  }

  return getCached(`mcp:${urls.join("|")}:${topic ?? ""}`, CACHE_TTL_MS, async () => {
    const settled = await Promise.allSettled(urls.map((url) => fetchSingle(url, topic)))
    const collected: AutopilotDiscoverySnippet[] = []
    for (const result of settled) {
      if (result.status === "fulfilled") {
        collected.push(...result.value)
      }
    }
    return collected.slice(0, MAX_TOTAL_SNIPPETS)
  })
}

function resolveEndpointUrls(): string[] {
  const multi = process.env.MCP_DISCOVERY_URLS?.split(",") ?? []
  const single = process.env.MCP_DISCOVERY_URL ? [process.env.MCP_DISCOVERY_URL] : []

  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of [...multi, ...single]) {
    const trimmed = raw?.trim()
    if (!trimmed) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

async function fetchSingle(url: string, topic: string | null): Promise<AutopilotDiscoverySnippet[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.MCP_DISCOVERY_TOKEN
          ? { Authorization: `Bearer ${process.env.MCP_DISCOVERY_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ topic: topic ?? "" }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return []
    }

    const data = (await response.json()) as { snippets?: unknown }
    if (!Array.isArray(data.snippets)) {
      return []
    }

    return data.snippets
      .map<AutopilotDiscoverySnippet | null>((item) => {
        if (!item || typeof item !== "object") {
          return null
        }
        const title = (item as { title?: unknown }).title
        const detail = (item as { detail?: unknown }).detail
        if (typeof title !== "string" || typeof detail !== "string") {
          return null
        }
        return {
          source: "mcp",
          title: title.slice(0, 80),
          detail: detail.slice(0, 240),
        }
      })
      .filter((value): value is AutopilotDiscoverySnippet => value !== null)
      .slice(0, MAX_SNIPPETS_PER_ENDPOINT)
  } catch (error) {
    console.warn(
      `MCP discovery fetch failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
    )
    return []
  } finally {
    clearTimeout(timer)
  }
}
