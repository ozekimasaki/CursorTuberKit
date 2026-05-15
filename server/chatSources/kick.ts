import { KickFlow } from "@gbrlstr/kick-flow"
import { createAllowModerationAssessment } from "../../shared/moderation.js"
import type { PlatformViewerEvent } from "../../shared/platformChat.js"
import { PlatformChatSource, asError, isRecord, normalizePlatformTarget, normalizeViewerText } from "../platformChatSource.js"

type KickWebSocketLike = {
  connect(): Promise<void>
  disconnect(): void
  on(event: string, listener: (...args: unknown[]) => void): void
}

export class KickChatSource extends PlatformChatSource {
  private chat: KickWebSocketLike | null = null
  private connected = false
  private target = ""

  constructor() {
    super("kick")
  }

  async connect(target: string) {
    const channel = normalizeKickChannel(target)
    const clientId = process.env.KICK_CLIENT_ID?.trim()
    const clientSecret = process.env.KICK_CLIENT_SECRET?.trim()

    if (!clientId || !clientSecret) {
      throw new Error("Kick mode requires KICK_CLIENT_ID and KICK_CLIENT_SECRET.")
    }

    const client = new KickFlow({ clientId, clientSecret })
    const chat = (await client.chat.connectToChatByChannel(channel)) as KickWebSocketLike

    this.target = channel
    this.chat = chat
    this.connected = false

    chat.on("message", (payload) => {
      const event = normalizeKickMessage(payload, this.target)
      if (event) {
        this.emitViewerEvent(event)
      }
    })
    chat.on("subscription", (payload) => {
      const event = normalizeKickSubscription(payload, this.target)
      if (event) {
        this.emitViewerEvent(event)
      }
    })
    chat.on("gift_subscription", (payload) => {
      const event = normalizeKickGiftSubscription(payload, this.target)
      if (event) {
        this.emitViewerEvent(event)
      }
    })
    chat.on("connect", () => {
      if (!this.connected) {
        this.connected = true
        this.emitConnected()
      }
    })
    chat.on("disconnect", (reason) => {
      this.connected = false
      this.emitDisconnected(typeof reason === "string" ? reason : "Kick chat disconnected.")
    })
    chat.on("error", (error) => {
      this.emitSourceError(asError(error, "Kick chat connection failed."))
    })

    await chat.connect()

    if (!this.connected) {
      this.connected = true
      this.emitConnected()
    }
  }

  async disconnect() {
    this.chat?.disconnect()
    this.chat = null
    if (this.connected) {
      this.connected = false
      this.emitDisconnected("Kick chat disconnected.")
    }
  }
}

function normalizeKickChannel(target: string) {
  const normalized = normalizePlatformTarget(target).replace(/^@/, "")

  if (!normalized) {
    throw new Error("Kick のチャンネル名を入力してください。")
  }

  try {
    const url = new URL(normalized)
    if (url.hostname.includes("kick.com")) {
      const channel = url.pathname.split("/").filter(Boolean)[0]
      if (channel) {
        return channel.toLowerCase()
      }
    }
  } catch {
    // treat as plain channel below
  }

  return normalized.toLowerCase()
}

function normalizeKickMessage(payload: unknown, target: string): PlatformViewerEvent | null {
  if (!isRecord(payload) || typeof payload.id !== "string" || typeof payload.content !== "string") {
    return null
  }

  if (!isRecord(payload.sender) || typeof payload.sender.username !== "string") {
    return null
  }

  const text = normalizeViewerText(payload.content)
  if (!text) {
    return null
  }

  return {
    authorName: payload.sender.username,
    id: `kick:${payload.id}`,
    isMonetized: false,
    kind: "comment",
    moderation: createAllowModerationAssessment(),
    platform: "kick",
    receivedAt: typeof payload.created_at === "string" ? payload.created_at : new Date().toISOString(),
    target,
    text,
  }
}

function normalizeKickSubscription(payload: unknown, target: string): PlatformViewerEvent | null {
  if (!isRecord(payload) || typeof payload.username !== "string") {
    return null
  }

  const months = typeof payload.months === "number" ? payload.months : null

  return {
    authorName: payload.username,
    id: `kick:subscription:${payload.username}:${Date.now()}`,
    isMonetized: true,
    kind: "subscription",
    moderation: createAllowModerationAssessment(),
    monetization: {
      amountText: months ? `${months} months` : undefined,
      tier: months ? `${months}` : undefined,
    },
    platform: "kick",
    receivedAt: new Date().toISOString(),
    target,
    text: months
      ? `${payload.username} subscribed for ${months} months.`
      : `${payload.username} subscribed.`,
  }
}

function normalizeKickGiftSubscription(payload: unknown, target: string): PlatformViewerEvent | null {
  if (
    !isRecord(payload) ||
    typeof payload.gifter_username !== "string" ||
    !Array.isArray(payload.gifted_usernames)
  ) {
    return null
  }

  const giftedCount = payload.gifted_usernames.filter((value): value is string => typeof value === "string").length
  const months = typeof payload.months === "number" ? payload.months : null

  return {
    authorName: payload.gifter_username,
    id: `kick:gift_subscription:${payload.gifter_username}:${Date.now()}`,
    isMonetized: true,
    kind: "gift_subscription",
    moderation: createAllowModerationAssessment(),
    monetization: {
      amountText: giftedCount > 0 ? `${giftedCount} gifted subs` : undefined,
      tier: months ? `${months}` : undefined,
    },
    platform: "kick",
    receivedAt: new Date().toISOString(),
    target,
    text:
      giftedCount > 0
        ? `${payload.gifter_username} gifted ${giftedCount} subscriptions.`
        : `${payload.gifter_username} sent gifted subscriptions.`,
  }
}
