import type { AutomationAction } from "../../shared/automation"
import type { Emotion } from "../../shared/emotion"
import type { ModerationAssessment } from "../../shared/moderation"

export type PreparedAutoReply = {
  action: AutomationAction | null
  finalEmotion: Emotion | null
  id: string
  isMonetized: boolean
  moderation: ModerationAssessment | null
  responseText: string
  sequence: number
  source: "content" | "viewer"
}

export function enqueuePreparedReply(
  queue: PreparedAutoReply[],
  reply: PreparedAutoReply,
): PreparedAutoReply[] {
  const nextReplies = [...queue.filter((item) => item.id !== reply.id), reply]
  const sortBySequence = (a: PreparedAutoReply, b: PreparedAutoReply) => a.sequence - b.sequence
  const monetizedReplies = nextReplies.filter((item) => item.isMonetized).sort(sortBySequence)
  const viewerReplies = nextReplies
    .filter((item) => !item.isMonetized && item.source === "viewer")
    .sort(sortBySequence)
  const contentReplies = nextReplies
    .filter((item) => !item.isMonetized && item.source === "content")
    .sort(sortBySequence)

  return [...monetizedReplies, ...viewerReplies, ...contentReplies]
}

export function dequeuePreparedReply(queue: PreparedAutoReply[]) {
  return queue.shift()
}

export function peekPreparedReply(queue: PreparedAutoReply[]) {
  return queue[0]
}

export function hasPreparedReply(queue: PreparedAutoReply[], id: string) {
  return queue.some((item) => item.id === id)
}

export function buildPreparedReplySignature(ids: Iterable<string>) {
  return [...ids].sort().join("|")
}

export function shouldAutoPlayPreparedReply(_reply: PreparedAutoReply) {
  return true
}
