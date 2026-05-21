import type { AutopilotDiscoverySnippet } from "../../shared/autopilot.js"
import { fetchMcpDiscoverySnippets } from "./mcp.js"
import { fetchSeasonContextSnippet } from "./season.js"
import { buildSelfHistorySnippets } from "./selfHistory.js"
import { buildTimeContextSnippet } from "./timeContext.js"
import { fetchTopicRotationSnippet } from "./topicRotation.js"
import { fetchWikipediaTeaSnippet } from "./wikipediaTea.js"

export type DiscoveryRequest = {
  enableTime?: boolean
  enableWikipediaTea?: boolean
  enableMcp?: boolean
  enableSeason?: boolean
  enableTopicRotation?: boolean
  enableSelfHistory?: boolean
  topicHint?: string | null
  recentAssistantTurns?: readonly string[]
}

const MAX_TOTAL_SNIPPETS = 6
const MAX_MCP_SNIPPETS = 2

/**
 * Aggregate discovery snippets from enabled sources. Each cheap source contributes
 * at most 1 snippet; MCP may contribute up to 2. Total capped to 6 so the planner
 * prompt does not balloon.
 *
 * Source ordering (defines display priority in the planner prompt):
 *   season → time → topic-rotation → wikipedia-tea → self-history → mcp
 */
export async function collectAutopilotDiscovery(
  request: DiscoveryRequest,
): Promise<AutopilotDiscoverySnippet[]> {
  const seasonTask: Promise<AutopilotDiscoverySnippet[]> =
    request.enableSeason !== false
      ? fetchSeasonContextSnippet().then((snippet) => [snippet])
      : Promise.resolve([])

  const timeTask: Promise<AutopilotDiscoverySnippet[]> =
    request.enableTime !== false
      ? Promise.resolve([buildTimeContextSnippet()])
      : Promise.resolve([])

  const rotationTask: Promise<AutopilotDiscoverySnippet[]> =
    request.enableTopicRotation !== false
      ? fetchTopicRotationSnippet().then((snippet) => [snippet])
      : Promise.resolve([])

  const teaTask: Promise<AutopilotDiscoverySnippet[]> =
    request.enableWikipediaTea !== false
      ? fetchWikipediaTeaSnippet()
          .then((snippet) => [snippet])
          .catch(() => [])
      : Promise.resolve([])

  const selfHistoryTask: Promise<AutopilotDiscoverySnippet[]> =
    request.enableSelfHistory !== false && request.recentAssistantTurns?.length
      ? Promise.resolve(buildSelfHistorySnippets(request.recentAssistantTurns))
      : Promise.resolve([])

  const mcpTask: Promise<AutopilotDiscoverySnippet[]> =
    request.enableMcp !== false
      ? fetchMcpDiscoverySnippets(request.topicHint ?? null).catch(() => [])
      : Promise.resolve([])

  const [season, time, rotation, tea, selfHistory, mcp] = await Promise.all([
    seasonTask,
    timeTask,
    rotationTask,
    teaTask,
    selfHistoryTask,
    mcpTask,
  ])

  const merged: AutopilotDiscoverySnippet[] = [
    ...season.slice(0, 1),
    ...time.slice(0, 1),
    ...rotation.slice(0, 1),
    ...tea.slice(0, 1),
    ...selfHistory.slice(0, 2),
    ...mcp.slice(0, MAX_MCP_SNIPPETS),
  ]

  return merged.slice(0, MAX_TOTAL_SNIPPETS)
}
