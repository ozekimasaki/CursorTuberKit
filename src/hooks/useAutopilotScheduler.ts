import { useEffect, useRef, type MutableRefObject } from "react"
import type { AutopilotOpenThread } from "../../shared/autopilot"
import { extractOpenThreads } from "../lib/openThreads"
import type { ConversationTurn } from "../lib/streamAi"
import {
  AUTO_CONTENT_PREFETCH_DELAY_MS,
  automaticContentDelay,
  nextAutopilotConversationStats,
  type AutomaticContentCandidate,
} from "../lib/autopilotScheduler"
import type { PreparedAutoReply } from "../lib/preparedReplyQueue"

type SchedulerStatus = "ready" | "thinking" | "synthesizing" | "playing" | "error"

export function useAutopilotScheduler() {
  const autoContentAbortRef = useRef<AbortController | null>(null)
  const autoContentBusyRef = useRef(false)
  const autoContentScheduledKeyRef = useRef<string | null>(null)
  const autoContentExpandedViewerEventsRef = useRef<Set<string>>(new Set())
  const autoContentSequenceRef = useRef(0)
  const autoContentSessionBaseRef = useRef<string | null>(null)
  const recentNoveltyScoresRef = useRef<number[]>([])
  const openThreadsRef = useRef<AutopilotOpenThread[]>([])
  const turnsSinceChapterBreakRef = useRef(0)
  const assistantTurnCountRef = useRef(0)

  function resetAutopilotSession(nextBase: string | null) {
    if (autoContentSessionBaseRef.current === nextBase) {
      return
    }

    autoContentSessionBaseRef.current = nextBase
    autoContentSequenceRef.current = 0
    autoContentExpandedViewerEventsRef.current = new Set()
    autoContentScheduledKeyRef.current = null
    recentNoveltyScoresRef.current = []
    openThreadsRef.current = []
    turnsSinceChapterBreakRef.current = 0
    assistantTurnCountRef.current = 0
  }

  function syncAutopilotRecentTurns(recentTurns: ConversationTurn[]) {
    openThreadsRef.current = extractOpenThreads(recentTurns)
    const nextStats = nextAutopilotConversationStats(
      recentTurns,
      assistantTurnCountRef.current,
      turnsSinceChapterBreakRef.current,
    )
    turnsSinceChapterBreakRef.current = nextStats.turnsSinceChapterBreak
    assistantTurnCountRef.current = nextStats.assistantTurnCount
  }

  return {
    assistantTurnCountRef,
    autoContentAbortRef,
    autoContentBusyRef,
    autoContentExpandedViewerEventsRef,
    autoContentScheduledKeyRef,
    autoContentSequenceRef,
    autoContentSessionBaseRef,
    openThreadsRef,
    recentNoveltyScoresRef,
    resetAutopilotSession,
    syncAutopilotRecentTurns,
    turnsSinceChapterBreakRef,
  }
}

export function useScheduleAutomaticContentSuggestion(options: {
  autoReplyEnabled: boolean
  autoContentBusyRef: MutableRefObject<boolean>
  autoContentScheduledKeyRef: MutableRefObject<string | null>
  nextAutomaticContentCandidate: AutomaticContentCandidate | null
  preparedAutoReplyQueueRef: MutableRefObject<PreparedAutoReply[]>
  status: SchedulerStatus
  triggerAutomaticContentSuggestion: (
    candidate: AutomaticContentCandidate,
    candidateKey: string,
  ) => void | Promise<void>
}) {
  useEffect(() => {
    if (
      !options.autoReplyEnabled ||
      (options.status !== "ready" && options.status !== "synthesizing" && options.status !== "playing") ||
      options.autoContentBusyRef.current ||
      options.preparedAutoReplyQueueRef.current.length > 0
    ) {
      options.autoContentScheduledKeyRef.current = null
      return
    }

    if (!options.nextAutomaticContentCandidate) {
      options.autoContentScheduledKeyRef.current = null
      return
    }

    const candidate = options.nextAutomaticContentCandidate
    const candidateKey = `${candidate.suggestion.id}:${candidate.anchor}`

    if (options.autoContentScheduledKeyRef.current === candidateKey) {
      return
    }

    options.autoContentScheduledKeyRef.current = candidateKey
    const delayMs =
      options.status === "ready" ? automaticContentDelay(candidate) : AUTO_CONTENT_PREFETCH_DELAY_MS
    const timeoutId = window.setTimeout(() => {
      if (options.autoContentScheduledKeyRef.current === candidateKey) {
        options.autoContentScheduledKeyRef.current = null
      }

      void options.triggerAutomaticContentSuggestion(candidate, candidateKey)
    }, delayMs)

    return () => {
      window.clearTimeout(timeoutId)

      if (options.autoContentScheduledKeyRef.current === candidateKey) {
        options.autoContentScheduledKeyRef.current = null
      }
    }
  }, [
    options.autoReplyEnabled,
    options.nextAutomaticContentCandidate,
    options.status,
  ])
}
