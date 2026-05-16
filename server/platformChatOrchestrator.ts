import { EventEmitter } from "node:events"
import { classifyModeration } from "../shared/moderation.js"
import {
  createIdlePlatformChatState,
  type PlatformChatMode,
  type PlatformChatState,
  type PlatformChatStateResponse,
  type PlatformViewerEvent,
} from "../shared/platformChat.js"
import { applyAutomationPolicyToPlatformState } from "./automationSafety.js"
import { KickChatSource } from "./chatSources/kick.js"
import { TwitchChatSource } from "./chatSources/twitch.js"
import { YouTubeChatSource } from "./chatSources/youtube.js"
import type { PlatformChatSource } from "./platformChatSource.js"

const MAX_RECENT_EVENTS = 30
const MAX_SEEN_EVENT_IDS = 500
const RECONNECT_BASE_DELAY_MS = 1_500
const RECONNECT_MAX_DELAY_MS = 30_000

type DesiredPlatformConnection = {
  mode: PlatformChatMode
  target: string
}

export class PlatformChatOrchestrator extends EventEmitter {
  private recentEvents: PlatformViewerEvent[] = []
  private seenEventIds = new Set<string>()
  private seenEventOrder: string[] = []
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private desiredConnection: DesiredPlatformConnection | null = null
  private source: PlatformChatSource | null = null
  private state = applyAutomationPolicyToPlatformState(createIdlePlatformChatState())

  getSnapshot(): PlatformChatStateResponse {
    return {
      recentEvents: [...this.recentEvents],
      state: { ...this.state },
    }
  }

  async start(mode: PlatformChatMode, target: string) {
    const normalizedTarget = target.trim()

    if (!normalizedTarget) {
      throw new Error("接続先のチャンネルまたは配信IDを入力してください。")
    }

    await this.stop()
    this.desiredConnection = { mode, target: normalizedTarget }
    this.reconnectAttempt = 0

    try {
      await this.connectDesiredSource({ mode, target: normalizedTarget }, null)
    } catch (error) {
      throw error
    }

    return this.getSnapshot()
  }

  async stop() {
    this.desiredConnection = null
    this.reconnectAttempt = 0
    this.clearReconnectTimer()

    if (this.source) {
      await this.disposeSource(this.source)
    }

    this.state = {
      ...applyAutomationPolicyToPlatformState(createIdlePlatformChatState()),
      updatedAt: new Date().toISOString(),
    }
    this.emitState()
    return this.getSnapshot()
  }

  private bindSource(source: PlatformChatSource) {
    let finished = false

    const finishConnection = (reason: string | null, status: PlatformChatState["status"]) => {
      if (finished) {
        return
      }

      finished = true
      source.removeAllListeners()
      if (this.source === source) {
        this.source = null
      }

      const desiredConnection = this.desiredConnection

      this.state = {
        ...applyAutomationPolicyToPlatformState(this.state),
        lastError: reason,
        status: desiredConnection ? "connecting" : status,
        updatedAt: new Date().toISOString(),
      }
      this.emitState()

      if (desiredConnection) {
        this.scheduleReconnect(reason)
      }
    }

    source.on("connected", () => {
      if (finished || this.source !== source) {
        return
      }

      this.clearReconnectTimer()
      this.reconnectAttempt = 0
      this.state = {
        ...applyAutomationPolicyToPlatformState(this.state),
        lastError: null,
        status: "connected",
        updatedAt: new Date().toISOString(),
      }
      this.emitState()
    })

    source.on("disconnected", (reason?: string) => {
      finishConnection(reason ?? this.state.lastError, "idle")
    })

    source.on("error", (error: Error) => {
      finishConnection(error.message, "error")
      void source.disconnect().catch(() => undefined)
    })

    source.on("viewer-event", (event: PlatformViewerEvent) => {
      if (finished || this.source !== source) {
        return
      }

      const moderatedEvent: PlatformViewerEvent = {
        ...event,
        moderation: classifyModeration(event.text),
      }

      if (this.seenEventIds.has(moderatedEvent.id)) {
        return
      }

      this.seenEventIds.add(moderatedEvent.id)
      this.seenEventOrder.push(moderatedEvent.id)
      if (this.seenEventOrder.length > MAX_SEEN_EVENT_IDS) {
        const removed = this.seenEventOrder.shift()
        if (removed) {
          this.seenEventIds.delete(removed)
        }
      }

      this.recentEvents = [moderatedEvent, ...this.recentEvents].slice(0, MAX_RECENT_EVENTS)
      this.state = {
        ...applyAutomationPolicyToPlatformState(this.state),
        lastError: null,
        lastEventAt: moderatedEvent.receivedAt,
        updatedAt: new Date().toISOString(),
      }
      this.emit("viewer-event", moderatedEvent)
      this.emitState()
    })
  }

  private emitState() {
    this.emit("state", applyAutomationPolicyToPlatformState({ ...this.state }))
  }

  private async connectDesiredSource(connection: DesiredPlatformConnection, lastError: string | null) {
    this.clearReconnectTimer()

    this.state = {
      ...applyAutomationPolicyToPlatformState(this.state),
      lastError,
      mode: connection.mode,
      status: "connecting",
      target: connection.target,
      updatedAt: new Date().toISOString(),
    }
    this.emitState()

    const source = createPlatformChatSource(connection.mode)
    this.bindSource(source)
    this.source = source

    try {
      await source.connect(connection.target)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Platform chat connection failed."

      if (this.source === source) {
        this.source = null
      }

      source.removeAllListeners()
      await source.disconnect().catch(() => undefined)
      this.state = {
        ...applyAutomationPolicyToPlatformState(this.state),
        lastError: message,
        mode: connection.mode,
        status: "connecting",
        target: connection.target,
        updatedAt: new Date().toISOString(),
      }
      this.emitState()
      this.scheduleReconnect(message)
      throw error
    }
  }

  private scheduleReconnect(reason: string | null) {
    if (!this.desiredConnection || this.reconnectTimer) {
      return
    }

    const connection = this.desiredConnection
    this.reconnectAttempt += 1
    const delayMs = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** (this.reconnectAttempt - 1))
    const detail = reason ? `${reason} ${Math.round(delayMs / 1000)}秒後に再接続します。` : `${Math.round(delayMs / 1000)}秒後に再接続します。`

    this.state = {
      ...applyAutomationPolicyToPlatformState(this.state),
      lastError: detail,
      mode: connection.mode,
      status: "connecting",
      target: connection.target,
      updatedAt: new Date().toISOString(),
    }
    this.emitState()

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null

      if (!this.desiredConnection || this.source) {
        return
      }

      void this.connectDesiredSource(this.desiredConnection, detail).catch(() => undefined)
    }, delayMs)
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) {
      return
    }

    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private async disposeSource(source: PlatformChatSource) {
    if (this.source === source) {
      this.source = null
    }

    source.removeAllListeners()
    await source.disconnect().catch(() => undefined)
  }
}

function createPlatformChatSource(mode: PlatformChatMode) {
  switch (mode) {
    case "youtube":
      return new YouTubeChatSource()
    case "twitch":
      return new TwitchChatSource()
    case "kick":
      return new KickChatSource()
  }
}
