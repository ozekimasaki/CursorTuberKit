import { Innertube } from "youtubei.js"
import { createAllowModerationAssessment } from "../../shared/moderation.js"
import type { PlatformViewerEvent } from "../../shared/platformChat.js"
import { PlatformChatSource, asError, isRecord, normalizeViewerText, numberToCssColor } from "../platformChatSource.js"

type YouTubeLiveChat = {
  on(type: "chat-update", listener: (action: unknown) => void): void
  on(type: "end", listener: () => void): void
  on(type: "error", listener: (error: Error) => void): void
  start(): void
  stop(): void
}

export class YouTubeChatSource extends PlatformChatSource {
  private chat: YouTubeLiveChat | null = null
  private connected = false
  private target = ""

  constructor() {
    super("youtube")
  }

  async connect(target: string) {
    const videoId = parseYouTubeVideoId(target)
    const yt = await Innertube.create()
    const info = await yt.getInfo(videoId)
    const chat = info.getLiveChat() as unknown as YouTubeLiveChat

    this.target = videoId
    this.chat = chat
    this.connected = false

    chat.on("chat-update", (action) => {
      const event = normalizeYouTubeAction(action, this.target)
      if (event) {
        this.emitViewerEvent(event)
      }
    })
    chat.on("error", (error) => {
      this.emitSourceError(asError(error, "YouTube live chat connection failed."))
    })
    chat.on("end", () => {
      this.connected = false
      this.emitDisconnected("YouTube live chat ended.")
    })

    chat.start()

    if (!this.connected) {
      this.connected = true
      this.emitConnected()
    }
  }

  async disconnect() {
    this.chat?.stop()
    this.chat = null
    if (this.connected) {
      this.connected = false
      this.emitDisconnected("YouTube live chat disconnected.")
    }
  }
}

function parseYouTubeVideoId(target: string) {
  const trimmed = target.trim()

  if (!trimmed) {
    throw new Error("YouTube の video ID または URL を入力してください。")
  }

  if (/^[\w-]{11}$/.test(trimmed)) {
    return trimmed
  }

  try {
    const url = new URL(trimmed)
    const host = url.hostname.replace(/^www\./, "")

    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0]
      if (/^[\w-]{11}$/.test(id)) return id
    }

    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const watchId = url.searchParams.get("v")
      if (watchId && /^[\w-]{11}$/.test(watchId)) {
        return watchId
      }

      const parts = url.pathname.split("/").filter(Boolean)
      const liveIndex = parts.indexOf("live")
      if (liveIndex !== -1) {
        const liveId = parts[liveIndex + 1]
        if (liveId && /^[\w-]{11}$/.test(liveId)) {
          return liveId
        }
      }
    }
  } catch {
    // fall through to error below
  }

  throw new Error("YouTube の video ID または配信 URL を正しく入力してください。")
}

function normalizeYouTubeAction(action: unknown, target: string): PlatformViewerEvent | null {
  const item = extractActionItem(action)

  if (!item || !isRecord(item) || typeof item.id !== "string") {
    return null
  }

  if (isYouTubeTextMessage(item)) {
    const text = normalizeViewerText(item.message.toString())
    if (!text) return null
      return {
        authorName: item.author.name,
        id: `youtube:${item.id}`,
        isMonetized: false,
        kind: "comment",
        moderation: createAllowModerationAssessment(),
        platform: "youtube",
        receivedAt: toIsoTime(item.timestamp),
        target,
        text,
    }
  }

  if (isYouTubePaidMessage(item)) {
    const text = normalizeViewerText(item.message.toString())
    if (!text) return null
      return {
        authorName: item.author.name,
        id: `youtube:${item.id}`,
        isMonetized: true,
        kind: "superchat",
        moderation: createAllowModerationAssessment(),
        monetization: {
          accentColor: numberToCssColor(item.header_background_color),
          amountText: item.purchase_amount,
      },
      platform: "youtube",
      receivedAt: toIsoTime(item.timestamp),
      target,
      text,
    }
  }

  if (isYouTubePaidSticker(item)) {
    return {
      authorName: item.author.name,
      id: `youtube:${item.id}`,
      isMonetized: true,
      kind: "paid_sticker",
      moderation: createAllowModerationAssessment(),
      monetization: {
        accentColor: numberToCssColor(item.background_color),
        amountText: item.purchase_amount,
      },
      platform: "youtube",
      receivedAt: toIsoTime(item.timestamp),
      target,
      text: normalizeViewerText(item.sticker_accessibility_label) || "Paid Sticker",
    }
  }

  if (isYouTubeMembership(item)) {
    const header = item.header_subtext.toString()
    const body = item.message ? item.message.toString() : ""
    const text = normalizeViewerText([header, body].filter(Boolean).join(" / "))
    if (!text) return null
    return {
      authorName: item.author.name,
      id: `youtube:${item.id}`,
      isMonetized: true,
      kind: "membership",
      moderation: createAllowModerationAssessment(),
      platform: "youtube",
      receivedAt: toIsoTime(item.timestamp),
      target,
      text,
    }
  }

  return null
}

function extractActionItem(action: unknown) {
  if (!isRecord(action)) {
    return null
  }

  if (action.item !== undefined) {
    return action.item
  }

  if (action.target_item !== undefined) {
    return action.target_item
  }

  if (action.replacement_item !== undefined) {
    return action.replacement_item
  }

  return null
}

function toIsoTime(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value).toISOString()
    : new Date().toISOString()
}

function hasAuthorName(value: unknown): value is { author: { name: string } } {
  return (
    isRecord(value) &&
    isRecord(value.author) &&
    typeof value.author.name === "string" &&
    value.author.name.trim().length > 0
  )
}

function hasMessageToString(value: unknown): value is { message: { toString(): string } } {
  return (
    isRecord(value) &&
    isRecord(value.message) &&
    typeof value.message.toString === "function"
  )
}

function isYouTubeTextMessage(
  value: unknown,
): value is {
  author: { name: string }
  id: string
  message: { toString(): string }
  timestamp: number
} {
  if (!isRecord(value) || !hasAuthorName(value) || !hasMessageToString(value)) {
    return false
  }

  const record = value as Record<string, unknown>
  return typeof record.timestamp === "number"
}

function isYouTubePaidMessage(
  value: unknown,
): value is {
  author: { name: string }
  header_background_color: number
  id: string
  message: { toString(): string }
  purchase_amount: string
  timestamp: number
} {
  if (!isRecord(value) || !hasAuthorName(value) || !hasMessageToString(value)) {
    return false
  }

  const record = value as Record<string, unknown>
  return (
    typeof record.purchase_amount === "string" &&
    typeof record.header_background_color === "number" &&
    typeof record.timestamp === "number"
  )
}

function isYouTubePaidSticker(
  value: unknown,
): value is {
  author: { name: string }
  background_color: number
  id: string
  purchase_amount: string
  sticker_accessibility_label: string
  timestamp: number
} {
  if (!isRecord(value) || !hasAuthorName(value)) {
    return false
  }

  const record = value as Record<string, unknown>
  return (
    typeof record.purchase_amount === "string" &&
    typeof record.sticker_accessibility_label === "string" &&
    typeof record.background_color === "number" &&
    typeof record.timestamp === "number"
  )
}

function isYouTubeMembership(
  value: unknown,
): value is {
  author: { name: string }
  header_subtext: { toString(): string }
  id: string
  message?: { toString(): string }
  timestamp: number
} {
  if (!isRecord(value) || !hasAuthorName(value)) {
    return false
  }

  const record = value as Record<string, unknown>

  if (!isRecord(record.header_subtext)) {
    return false
  }

  return typeof record.header_subtext.toString === "function" && typeof record.timestamp === "number"
}
