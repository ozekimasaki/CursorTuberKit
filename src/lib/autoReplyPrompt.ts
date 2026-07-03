import type { PlatformViewerEvent } from "../../shared/platformChat"
import { describeEventKind } from "./viewerEventTriage"

export function buildAutoReplyPrompt(
  event: PlatformViewerEvent,
  characterName: string,
) {
  const monetizationText = event.monetization?.amountText ? ` / ${event.monetization.amountText}` : ""
  const eventKindLabel = describeEventKind(event)

  return [
    `配信中の視聴者コメントです。${event.authorName}さんが ${event.platform} で送ってくれました。`,
    `種別: ${eventKindLabel}${monetizationText}`,
    `コメント: ${event.text}`,
    `${characterName}本人として、そのまま配信で話す感じで自然に返事してください。`,
  ].join("\n")
}
