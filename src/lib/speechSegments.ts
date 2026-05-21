import type { ConversationTurn } from "./streamAi"
import {
  FORCE_SPLIT_POSITION,
  MAX_LEN_BEFORE_FORCE_SPLIT,
  MIN_LEN_FOR_PAUSE_SPLIT,
  MIN_PREFIX_BEFORE_PAUSE,
  QUEUED_PLAYBACK_GAP_MS,
  RECENT_TURNS_CONTEXT_SIZE,
} from "./autoReplyConstants"

export function trimRecentTurns(turns: ConversationTurn[]) {
  return turns.slice(-RECENT_TURNS_CONTEXT_SIZE)
}

export function extractSpeechSegments(text: string, options?: { force?: boolean }) {
  const segments: string[] = []
  let remaining = text
  const sentenceBoundary = /[。！？!?…]\s*/
  const pauseBoundary = /[、，,]\s*/

  while (remaining.length > 0) {
    const sentenceMatch = sentenceBoundary.exec(remaining)

    if (sentenceMatch) {
      const splitIndex = sentenceMatch.index + sentenceMatch[0].length
      segments.push(remaining.slice(0, splitIndex).trim())
      remaining = remaining.slice(splitIndex)
      continue
    }

    if (remaining.length >= MIN_LEN_FOR_PAUSE_SPLIT) {
      let splitIndex = -1
      let match: RegExpExecArray | null = null
      const pauseRegex = new RegExp(pauseBoundary.source, "g")

      while ((match = pauseRegex.exec(remaining)) !== null) {
        if (match.index + match[0].length >= MIN_PREFIX_BEFORE_PAUSE) {
          splitIndex = match.index + match[0].length
        }
      }

      if (splitIndex === -1 && remaining.length >= MAX_LEN_BEFORE_FORCE_SPLIT) {
        splitIndex = FORCE_SPLIT_POSITION
      }

      if (splitIndex !== -1) {
        segments.push(remaining.slice(0, splitIndex).trim())
        remaining = remaining.slice(splitIndex)
        continue
      }
    }

    break
  }

  if (options?.force && remaining.trim()) {
    segments.push(remaining.trim())
    remaining = ""
  }

  return {
    segments: segments.filter(Boolean),
    remainder: remaining,
  }
}

export function waitForQueuedPlaybackGap(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"))
      return
    }

    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort)
      resolve()
    }, QUEUED_PLAYBACK_GAP_MS)

    const handleAbort = () => {
      window.clearTimeout(timeoutId)
      signal.removeEventListener("abort", handleAbort)
      reject(new DOMException("The operation was aborted.", "AbortError"))
    }

    signal.addEventListener("abort", handleAbort, { once: true })
  })
}
