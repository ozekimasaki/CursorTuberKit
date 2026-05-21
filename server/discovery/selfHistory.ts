import type { AutopilotDiscoverySnippet } from "../../shared/autopilot.js"

const MAX_DETAIL_LENGTH = 220

/**
 * Surface OLDER assistant turns (>=5 turns back) as discovery snippets so the planner
 * can pull back long-tail topics that fall off the recent-turns window.
 *
 * Returns up to 2 snippets. Skips the most recent 4 turns (those already passed to
 * the planner directly as recentAssistantTurns).
 */
export function buildSelfHistorySnippets(
  recentAssistantTurns: readonly string[],
): AutopilotDiscoverySnippet[] {
  if (recentAssistantTurns.length < 5) {
    return []
  }

  // The caller passes assistant turns oldest→newest. The last 4 are already exposed
  // to the planner; we want what came before them.
  const older = recentAssistantTurns.slice(0, recentAssistantTurns.length - 4)
  if (older.length === 0) {
    return []
  }

  // Pick the two most-recent-of-the-old turns to keep them topical-but-not-immediate.
  const picks = older.slice(-2)

  return picks
    .map((text, index) => {
      const normalized = normalize(text)
      if (!normalized) {
        return null
      }
      const offset = older.length - picks.length + index
      const turnsAgo = recentAssistantTurns.length - offset
      return {
        source: "self-history" as const,
        title: `自分の発話 (${turnsAgo}ターン前)`,
        detail: truncate(normalized, MAX_DETAIL_LENGTH),
      }
    })
    .filter((value): value is { source: "self-history"; title: string; detail: string } => value !== null)
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
