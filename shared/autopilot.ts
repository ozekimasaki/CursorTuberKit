import type { CharacterSinValues } from "./characterState.js"

export type AutopilotSuggestionId =
  | "mini-corner"
  | "opening"
  | "recap"
  | "teaser"
  | "chapter-break"

export type AutopilotPlannerSource =
  | "memkraft"
  | "time"
  | "wikipedia-tea"
  | "mcp"
  | "viewer"
  | "self"
  | "season"
  | "topic-rotation"
  | "self-history"

export type AutopilotDiscoverySnippet = {
  source: AutopilotPlannerSource
  title: string
  detail: string
}

export type AutopilotOpenThread = {
  tag: string
  snippet: string
  lastSeenTurnIndex: number
}

export type AutopilotPlannerHints = {
  wantMoodShift?: boolean
  wantDeepCallback?: boolean
}

export type AutopilotTopicRequestBody = {
  baseSuggestionId: AutopilotSuggestionId
  basePrompt: string
  baseSummary: string
  baseTitle: string
  characterStateSins: CharacterSinValues
  liveViewerEvent?: {
    authorName: string
    text: string
  } | null
  recentAssistantTurns: string[]
  recentUserTurns: string[]
  toneDirective?: string
  openThreads?: AutopilotOpenThread[]
  recentNoveltyScores?: number[]
  plannerHints?: AutopilotPlannerHints
  /**
   * Discovery sources to use. Omit to use server-side defaults.
   */
  discovery?: {
    time?: boolean
    wikipediaTea?: boolean
    mcp?: boolean
    season?: boolean
    topicRotation?: boolean
    selfHistory?: boolean
  }
}

export type AutopilotRetriedReason = "critic" | "novelty"

export type AutopilotTopicResponse = {
  prompt: string
  summary: string
  title: string
  novelty: string
  noveltyScore: number
  topicTags: string[]
  sources: AutopilotPlannerSource[]
  toneDirective: string
  noveltyTarget?: number
  retriedReason?: AutopilotRetriedReason | null
  critic?: {
    accepted: boolean
    reason: string
    regenerated: boolean
  }
}
