import type { CharacterSinValues } from "../../shared/characterState"
import type { PlatformChatState, PlatformViewerEvent } from "../../shared/platformChat"
import {
  computeSuggestionWeights,
  pickWeightedSuggestion,
  type SuggestionContext,
} from "../../shared/sinsBias"
import type { AutomaticContentCandidate } from "./autopilotScheduler"
import type { CharacterContentSuggestion, CharacterContentSurface } from "./contentSurface"
import type { ConversationTurn } from "./streamAi"
import { assessViewerEventTriage } from "./viewerEventTriage"

export function selectAutomaticContentSuggestion(options: {
  contentSurface: CharacterContentSurface
  liveViewerEvents: PlatformViewerEvent[]
  platformState: PlatformChatState
  recentTurns: ConversationTurn[]
  sequence: number
  sessionKey: string | null
  sins: CharacterSinValues
  usedViewerEventIds: Set<string>
  openThreadCount: number
  turnsSinceChapterBreak: number
  recentNoveltyAverage: number | undefined
}): AutomaticContentCandidate | null {
  if (!options.sessionKey) {
    return null
  }

  const latestViewerEvent =
    options.liveViewerEvents.find((event) => assessViewerEventTriage(event).action === "queue") ?? null
  const assistantTurns = options.recentTurns.filter((turn) => turn.role === "assistant")
  const latestAssistantTurn = assistantTurns[assistantTurns.length - 1] ?? null
  const suggestions = new Map(options.contentSurface.suggestions.map((suggestion) => [suggestion.id, suggestion]))

  if (!latestAssistantTurn) {
    const opening = suggestions.get("opening")

    if (opening) {
      return {
        anchor: `${options.sessionKey}:opening`,
        reason: "配信開始直後なので、最初の一声を自動で整えます。",
        source: "opening",
        suggestion: opening,
      }
    }
  }

  if (latestViewerEvent && !options.usedViewerEventIds.has(latestViewerEvent.id)) {
    const miniCorner = suggestions.get("mini-corner")

    if (miniCorner) {
      return {
        anchor: `${options.sessionKey}:viewer:${latestViewerEvent.id}`,
        reason: `${latestViewerEvent.authorName}さんのコメントから、短いネタ面を自動で広げます。`,
        source: "viewer",
        suggestion: miniCorner,
        viewerEventId: latestViewerEvent.id,
      }
    }
  }

  const nextSuggestionId = selectAutopilotSuggestionId(
    options.sequence,
    {
      assistantTurnCount: assistantTurns.length,
      openThreadCount: options.openThreadCount,
      turnsSinceChapterBreak: options.turnsSinceChapterBreak,
      recentNoveltyAverage: options.recentNoveltyAverage,
    },
    options.sins,
  )
  const nextSuggestion = suggestions.get(nextSuggestionId)

  if (!nextSuggestion) {
    return null
  }

  const reason = (() => {
    if (nextSuggestion.id === "recap") {
      return "いまの流れを一度まとめて、次の雑談へつなぎます。"
    }
    if (nextSuggestion.id === "teaser") {
      return "次に広げる話題を先回りで差し込み、配信の流れを保ちます。"
    }
    if (latestViewerEvent && options.platformState.status === "connected") {
      return "コメントを拾い続けながら、流れを切らさないよう小ネタへ広げます。"
    }
    return "コメントが無くても止まらないよう、自走トークを次へ進めます。"
  })()

  return {
    anchor: `${options.sessionKey}:sequence:${options.sequence}`,
    reason,
    source: "autopilot",
    suggestion: nextSuggestion,
  }
}

export function selectAutopilotSuggestionId(
  sequence: number,
  ctx: SuggestionContext,
  sins: CharacterSinValues,
): CharacterContentSuggestion["id"] {
  const weights = computeSuggestionWeights(sins, ctx)
  const picked = pickWeightedSuggestion(weights, sequence)
  if (picked === "opening") {
    return "mini-corner"
  }
  return picked
}
