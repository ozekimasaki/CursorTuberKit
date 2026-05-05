export const platformModes = ["youtube", "twitch", "kick"] as const

export type PlatformChatMode = (typeof platformModes)[number]

export type PlatformViewerEventKind =
  | "comment"
  | "superchat"
  | "paid_sticker"
  | "membership"
  | "subscription"
  | "gift_subscription"
  | "cheer"
  | "hype_chat"

export type PlatformViewerEventMonetization = {
  accentColor?: string
  amountMinor?: number
  amountText?: string
  currency?: string
  tier?: string
}

export type PlatformViewerEvent = {
  authorName: string
  id: string
  isMonetized: boolean
  kind: PlatformViewerEventKind
  monetization?: PlatformViewerEventMonetization
  platform: PlatformChatMode
  receivedAt: string
  target: string
  text: string
}

export type PlatformChatStatus = "idle" | "connecting" | "connected" | "error"

export type PlatformChatState = {
  autoReplyScope: "in_app_only"
  lastError: string | null
  lastEventAt: string | null
  mode: PlatformChatMode | null
  status: PlatformChatStatus
  target: string | null
  updatedAt: string
}

export type PlatformChatStateResponse = {
  recentEvents: PlatformViewerEvent[]
  state: PlatformChatState
}

export function createIdlePlatformChatState(): PlatformChatState {
  return {
    autoReplyScope: "in_app_only",
    lastError: null,
    lastEventAt: null,
    mode: null,
    status: "idle",
    target: null,
    updatedAt: new Date().toISOString(),
  }
}

export function isPlatformChatMode(value: unknown): value is PlatformChatMode {
  return typeof value === "string" && (platformModes as readonly string[]).includes(value)
}

