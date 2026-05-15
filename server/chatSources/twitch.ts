import { ChatClient, type ChatMessage } from "@twurple/chat"
import type { Listener } from "@d-fischer/typed-event-emitter"
import { createAllowModerationAssessment } from "../../shared/moderation.js"
import type { PlatformViewerEvent } from "../../shared/platformChat.js"
import { PlatformChatSource, asError, normalizePlatformTarget, normalizeViewerText } from "../platformChatSource.js"

type Unsubscribe = () => void

export class TwitchChatSource extends PlatformChatSource {
  private cleanup: Unsubscribe[] = []
  private client: ChatClient | null = null
  private connected = false
  private target = ""

  constructor() {
    super("twitch")
  }

  async connect(target: string) {
    const channel = normalizeTwitchChannel(target)
    const client = new ChatClient({
      channels: [channel],
      readOnly: true,
    })

    this.target = channel
    this.client = client
    this.connected = false

    this.cleanup.push(
      toUnsubscribe(client.onMessage((joinedChannel, user, text, msg) => {
        const event = normalizeTwitchMessage(joinedChannel, user, text, msg, this.target)
        if (event) {
          this.emitViewerEvent(event)
        }
      })),
      toUnsubscribe(client.onSub((joinedChannel, user, subInfo, msg) => {
        this.emitViewerEvent(
          createTwitchMonetizedEvent(joinedChannel, msg.id, "subscription", subInfo.displayName, subInfo.message, this.target, {
            amountText: subInfo.planName,
            tier: subInfo.plan,
          }),
        )
      })),
      toUnsubscribe(client.onResub((joinedChannel, user, subInfo, msg) => {
        this.emitViewerEvent(
          createTwitchMonetizedEvent(joinedChannel, msg.id, "subscription", subInfo.displayName, subInfo.message, this.target, {
            amountText: subInfo.planName,
            tier: subInfo.plan,
          }),
        )
      })),
      toUnsubscribe(client.onSubGift((joinedChannel, user, subInfo, msg) => {
        const giftedBy = subInfo.gifterDisplayName || subInfo.gifter || user
        this.emitViewerEvent(
          createTwitchMonetizedEvent(
            joinedChannel,
            msg.id,
            "gift_subscription",
            giftedBy,
            `${giftedBy} gifted a ${subInfo.planName} subscription.`,
            this.target,
            {
              amountText: subInfo.planName,
              tier: subInfo.plan,
            },
          ),
        )
      })),
      toUnsubscribe(client.onCommunitySub((joinedChannel, user, subInfo, msg) => {
        const giftedBy = subInfo.gifterDisplayName || subInfo.gifter || user
        this.emitViewerEvent(
          createTwitchMonetizedEvent(
            joinedChannel,
            msg.id,
            "gift_subscription",
            giftedBy,
            `${giftedBy} gifted ${subInfo.count} subscriptions.`,
            this.target,
            {
              amountText: `${subInfo.count} gifted subs`,
              tier: subInfo.plan,
            },
          ),
        )
      })),
      toUnsubscribe(client.onConnect(() => {
        if (!this.connected) {
          this.connected = true
          this.emitConnected()
        }
      })),
      toUnsubscribe(client.onDisconnect((_manually, reason) => {
        this.connected = false
        this.emitDisconnected(reason?.message || "Twitch chat disconnected.")
      })),
      toUnsubscribe(client.onAuthenticationFailure((text) => {
        this.emitSourceError(new Error(`Twitch authentication failed: ${text}`))
      })),
    )

    await waitForTwitchJoin(client, channel)
  }

  async disconnect() {
    for (const dispose of this.cleanup.splice(0)) {
      dispose()
    }

    this.client?.quit()
    this.client = null

    if (this.connected) {
      this.connected = false
      this.emitDisconnected("Twitch chat disconnected.")
    }
  }
}

function normalizeTwitchChannel(target: string) {
  const normalized = normalizePlatformTarget(target).replace(/^[@#]/, "")

  if (!normalized) {
    throw new Error("Twitch のチャンネル名を入力してください。")
  }

  try {
    const url = new URL(normalized)
    if (url.hostname.includes("twitch.tv")) {
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

async function waitForTwitchJoin(client: ChatClient, channel: string) {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error("Twitch chat connection timed out."))
    }, 15000)

    const cleanupFns: Unsubscribe[] = [
      toUnsubscribe(client.onJoin((joinedChannel) => {
        if (stripChannelPrefix(joinedChannel) === channel) {
          cleanup()
          resolve()
        }
      })),
      toUnsubscribe(client.onJoinFailure((joinedChannel, reason) => {
        if (stripChannelPrefix(joinedChannel) === channel) {
          cleanup()
          reject(new Error(`Twitch channel join failed: ${reason}`))
        }
      })),
      toUnsubscribe(client.onAuthenticationFailure((text) => {
        cleanup()
        reject(new Error(`Twitch authentication failed: ${text}`))
      })),
    ]

    const cleanup = () => {
      clearTimeout(timeout)
      cleanupFns.forEach((dispose) => dispose())
    }

    client.connect()
  })
}

function normalizeTwitchMessage(
  joinedChannel: string,
  user: string,
  text: string,
  msg: ChatMessage,
  target: string,
): PlatformViewerEvent | null {
  if (stripChannelPrefix(joinedChannel) !== target) {
    return null
  }

  const normalizedText = normalizeViewerText(text)
  if (!normalizedText) {
    return null
  }

  if (msg.isHypeChat) {
    return createTwitchMonetizedEvent(joinedChannel, msg.id, "hype_chat", displayName(msg, user), normalizedText, target, {
      amountMinor: msg.hypeChatAmount ?? undefined,
      amountText:
        msg.hypeChatLocalizedAmount !== null && msg.hypeChatCurrency !== null
          ? `${msg.hypeChatLocalizedAmount} ${msg.hypeChatCurrency}`
          : undefined,
      currency: msg.hypeChatCurrency ?? undefined,
    })
  }

  if (msg.isCheer || msg.bits > 0) {
    return createTwitchMonetizedEvent(joinedChannel, msg.id, "cheer", displayName(msg, user), normalizedText, target, {
      amountMinor: msg.bits,
      amountText: `${msg.bits} bits`,
      currency: "BITS",
    })
  }

  return {
    authorName: displayName(msg, user),
    id: `twitch:${msg.id}`,
    isMonetized: false,
    kind: "comment",
    moderation: createAllowModerationAssessment(),
    platform: "twitch",
    receivedAt: msg.date.toISOString(),
    target,
    text: normalizedText,
  }
}

function createTwitchMonetizedEvent(
  joinedChannel: string,
  eventId: string,
  kind: PlatformViewerEvent["kind"],
  authorName: string,
  text: string | undefined,
  target: string,
  monetization: PlatformViewerEvent["monetization"],
): PlatformViewerEvent {
  return {
    authorName,
    id: `twitch:${eventId}`,
    isMonetized: true,
    kind,
    moderation: createAllowModerationAssessment(),
    monetization,
    platform: "twitch",
    receivedAt: new Date().toISOString(),
    target: stripChannelPrefix(joinedChannel) || target,
    text: normalizeViewerText(text) || defaultTwitchEventText(kind),
  }
}

function defaultTwitchEventText(kind: PlatformViewerEvent["kind"]) {
  switch (kind) {
    case "subscription":
      return "Subscribed."
    case "gift_subscription":
      return "Gifted subscriptions."
    case "cheer":
      return "Sent bits."
    case "hype_chat":
      return "Sent a Hype Chat."
    default:
      return "Sent a monetized chat event."
  }
}

function stripChannelPrefix(channel: string) {
  return channel.replace(/^#/, "").toLowerCase()
}

function displayName(message: ChatMessage, fallbackUser: string) {
  return message.userInfo.displayName || fallbackUser
}

function toUnsubscribe(listener: Listener): Unsubscribe {
  return () => listener.unbind()
}
