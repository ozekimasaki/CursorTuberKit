import type { PlatformViewerEvent } from "../../shared/platformChat"

type ViewerEventFeedProps = {
  emptyMessage?: string
  events: PlatformViewerEvent[]
}

export function ViewerEventFeed({
  emptyMessage = "まだ配信コメントは受信していません。",
  events,
}: ViewerEventFeedProps) {
  if (events.length === 0) {
    return <p className="event-feed__empty">{emptyMessage}</p>
  }

  return (
    <div className="event-feed">
      {events.map((event) => (
        <article
          key={event.id}
          className={`event-item${event.isMonetized ? " event-item--monetized" : ""}`}
        >
          <div className="event-item__head">
            <div className="event-item__author-block">
              <strong className="event-item__author">{event.authorName}</strong>
              <span className="event-item__time">{formatRelativeTimestamp(event.receivedAt)}</span>
            </div>
            {event.monetization?.amountText && (
              <span className="event-item__money">{event.monetization.amountText}</span>
            )}
          </div>
          <div className="event-item__meta">
            <span className="event-item__badge">{eventLabel(event)}</span>
            {event.moderation.disposition !== "allow" && (
              <span className={`event-item__moderation event-item__moderation--${event.moderation.disposition}`}>
                {event.moderation.disposition === "block" ? "BLOCK" : "REVIEW"}
              </span>
            )}
          </div>
          <p className="event-item__text">{event.text}</p>
        </article>
      ))}
    </div>
  )
}

function eventLabel(event: PlatformViewerEvent) {
  switch (event.kind) {
    case "comment":
      return event.platform.toUpperCase()
    case "superchat":
      return "SUPER CHAT"
    case "paid_sticker":
      return "PAID STICKER"
    case "membership":
      return "MEMBERSHIP"
    case "subscription":
      return "SUB"
    case "gift_subscription":
      return "GIFT"
    case "cheer":
      return "CHEER"
    case "hype_chat":
      return "HYPE CHAT"
  }
}

function formatRelativeTimestamp(value: string) {
  const timestamp = Date.parse(value)

  if (Number.isNaN(timestamp)) {
    return "時刻不明"
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))

  if (diffSeconds < 10) {
    return "たった今"
  }

  if (diffSeconds < 60) {
    return `${diffSeconds}秒前`
  }

  const diffMinutes = Math.floor(diffSeconds / 60)

  if (diffMinutes < 60) {
    return `${diffMinutes}分前`
  }

  const diffHours = Math.floor(diffMinutes / 60)

  if (diffHours < 24) {
    return `${diffHours}時間前`
  }

  return `${Math.floor(diffHours / 24)}日前`
}
