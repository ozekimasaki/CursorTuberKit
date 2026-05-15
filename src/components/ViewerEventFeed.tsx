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
            <span className="event-item__badge">{eventLabel(event)}</span>
            <strong className="event-item__author">{event.authorName}</strong>
            {event.moderation.disposition !== "allow" && (
              <span className={`event-item__moderation event-item__moderation--${event.moderation.disposition}`}>
                {event.moderation.disposition === "block" ? "BLOCK" : "REVIEW"}
              </span>
            )}
            {event.monetization?.amountText && (
              <span className="event-item__money">{event.monetization.amountText}</span>
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
