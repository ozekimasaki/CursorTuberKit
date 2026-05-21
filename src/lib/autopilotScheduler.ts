import type { PlatformChatState, PlatformViewerEvent } from "../../shared/platformChat"
import type { ConversationTurn } from "./streamAi"
import type { CharacterContentSuggestion } from "./contentSurface"

export const AUTO_CONTENT_PREFETCH_DELAY_MS = 250
export const RECENT_NOVELTY_SCORE_CAP = 8

const AUTO_CONTENT_OPENING_DELAY_MS = 250
const AUTO_CONTENT_VIEWER_FOLLOWUP_DELAY_MS = 900
const AUTO_CONTENT_MINI_CORNER_DELAY_MS = 1500
const AUTO_CONTENT_RECAP_DELAY_MS = 2200
const AUTO_CONTENT_TEASER_DELAY_MS = 3000
const AUTO_CONTENT_CHAPTER_BREAK_DELAY_MS = 2500

export type AutomaticContentCandidate = {
  anchor: string
  reason: string
  suggestion: CharacterContentSuggestion
  source: "autopilot" | "opening" | "viewer"
  viewerEventId?: string
}

export type AutopilotStalenessSnapshot = {
  latestViewerEventId: string | null
  turnCount: number
}

export function getAutoContentSessionBase(
  autoReplyEnabled: boolean,
  platformState: PlatformChatState,
) {
  if (!autoReplyEnabled) {
    return null
  }

  return platformState.status === "connected"
    ? `${platformState.mode ?? "chat"}:${platformState.target ?? "default"}`
    : "autopilot"
}

export function averageNoveltyScore(scores: number[]) {
  return scores.length > 0
    ? scores.reduce((sum, value) => sum + value, 0) / scores.length
    : undefined
}

export function createAutopilotStalenessSnapshot(
  liveViewerEvents: PlatformViewerEvent[],
  recentTurns: ConversationTurn[],
): AutopilotStalenessSnapshot {
  return {
    latestViewerEventId: liveViewerEvents[0]?.id ?? null,
    turnCount: recentTurns.length,
  }
}

export function isAutopilotStale(
  snapshot: AutopilotStalenessSnapshot,
  liveViewerEvents: PlatformViewerEvent[],
  recentTurns: ConversationTurn[],
) {
  const currentLatestId = liveViewerEvents[0]?.id ?? null
  return (
    (currentLatestId !== null && currentLatestId !== snapshot.latestViewerEventId) ||
    recentTurns.length !== snapshot.turnCount
  )
}

export function appendRecentNoveltyScore(
  scores: number[],
  score: number,
  cap = RECENT_NOVELTY_SCORE_CAP,
) {
  return [...scores, score].slice(-cap)
}

export function nextAutopilotConversationStats(
  recentTurns: ConversationTurn[],
  currentAssistantTurnCount: number,
  currentTurnsSinceChapterBreak: number,
) {
  const assistantTurns = recentTurns.filter((turn) => turn.role === "assistant")
  let turnsSinceChapterBreak = currentTurnsSinceChapterBreak

  if (assistantTurns.length !== currentAssistantTurnCount) {
    const delta = assistantTurns.length - currentAssistantTurnCount
    if (delta > 0) {
      turnsSinceChapterBreak += delta
    }
  }

  return {
    assistantTurnCount: assistantTurns.length,
    turnsSinceChapterBreak,
  }
}

export function automaticContentDelay(candidate: AutomaticContentCandidate) {
  if (candidate.source === "opening") {
    return AUTO_CONTENT_OPENING_DELAY_MS
  }

  if (candidate.source === "viewer") {
    return AUTO_CONTENT_VIEWER_FOLLOWUP_DELAY_MS
  }

  switch (candidate.suggestion.id) {
    case "mini-corner":
      return AUTO_CONTENT_MINI_CORNER_DELAY_MS
    case "recap":
      return AUTO_CONTENT_RECAP_DELAY_MS
    case "teaser":
      return AUTO_CONTENT_TEASER_DELAY_MS
    case "chapter-break":
      return AUTO_CONTENT_CHAPTER_BREAK_DELAY_MS
    case "opening":
      return AUTO_CONTENT_OPENING_DELAY_MS
  }
}
