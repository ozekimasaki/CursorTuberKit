import type { PlatformViewerEvent } from "../../shared/platformChat"
import { COMPACT_REPLY_BATCH_SIZE, COMPACT_REPLY_TRIGGER_COUNT } from "./autoReplyConstants"
import { describeEventKind } from "./viewerEventTriage"

export function buildAutoReplyPrompt(
  event: PlatformViewerEvent,
  characterName: string,
  options?: {
    shortReply?: boolean
  },
) {
  const monetizationText = event.monetization?.amountText ? ` / ${event.monetization.amountText}` : ""
  const eventKindLabel = describeEventKind(event)
  const replyInstruction = options?.shortReply
    ? `${characterName}本人として、そのまま配信で話す感じで、1〜2文の短い返事をすぐ返してください。`
    : `${characterName}本人として、そのまま配信で話す感じで自然に返事してください。`

  return [
    `配信中の視聴者コメントです。${event.authorName}さんが ${event.platform} で送ってくれました。`,
    `種別: ${eventKindLabel}${monetizationText}`,
    `コメント: ${event.text}`,
    replyInstruction,
  ].join("\n")
}

export function buildCompactAutoReplyPrompt(events: PlatformViewerEvent[], characterName: string) {
  return [
    "配信中に続けて届いた複数の視聴者コメントです。",
    "全部に均等に返さなくてよいですが、圧縮しすぎず、主軸1件に加えて近い話題ならもう1件まで自然に拾ってください。",
    "無理に全部をまとめず、拾ったコメントの内容がちゃんと残る返しにしてください。",
    `${characterName}本人として、そのまま配信で話せる返答を1〜3文で返してください。`,
    ...events.map((event) => `- ${event.authorName}: ${event.text}`),
  ].join("\n")
}

export function shouldUseShortAutoReplyMode(queueDepth: number) {
  return queueDepth >= 3
}

export function takeCompactViewerReplyBatch(queue: PlatformViewerEvent[]) {
  const first = queue[0]

  if (!first || first.isMonetized || first.kind !== "comment" || queue.length < COMPACT_REPLY_TRIGGER_COUNT) {
    return null
  }

  const candidates = queue.filter((event) => !event.isMonetized && event.kind === "comment").slice(0, COMPACT_REPLY_BATCH_SIZE)
  return candidates.length >= COMPACT_REPLY_TRIGGER_COUNT ? candidates : null
}
