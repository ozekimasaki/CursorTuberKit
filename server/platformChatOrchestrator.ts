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

export class PlatformChatOrchestrator extends EventEmitter {
  private recentEvents: PlatformViewerEvent[] = []
  private seenEventIds = new Set<string>()
  private seenEventOrder: string[] = []
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

    this.state = {
      ...applyAutomationPolicyToPlatformState(this.state),
      lastError: null,
      mode,
      status: "connecting",
      target: normalizedTarget,
      updatedAt: new Date().toISOString(),
    }
    this.emitState()

    const source = createPlatformChatSource(mode)
    this.bindSource(source)
    this.source = source

    try {
      await source.connect(normalizedTarget)
      this.state = {
        ...applyAutomationPolicyToPlatformState(this.state),
        lastError: null,
        mode,
        status: "connected",
        target: normalizedTarget,
        updatedAt: new Date().toISOString(),
      }
      this.emitState()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Platform chat connection failed."
      this.state = {
        ...applyAutomationPolicyToPlatformState(this.state),
        lastError: message,
        mode,
        status: "error",
        target: normalizedTarget,
        updatedAt: new Date().toISOString(),
      }
      this.emitState()
      throw error
    }

    return this.getSnapshot()
  }

  async stop() {
    if (this.source) {
      const source = this.source
      this.source = null
      source.removeAllListeners()
      await source.disconnect()
    }

    this.state = {
      ...applyAutomationPolicyToPlatformState(createIdlePlatformChatState()),
      updatedAt: new Date().toISOString(),
    }
    this.emitState()
    return this.getSnapshot()
  }

  private bindSource(source: PlatformChatSource) {
    source.on("connected", () => {
      this.state = {
        ...applyAutomationPolicyToPlatformState(this.state),
        lastError: null,
        status: "connected",
        updatedAt: new Date().toISOString(),
      }
      this.emitState()
    })

    source.on("disconnected", (reason?: string) => {
      this.state = {
        ...applyAutomationPolicyToPlatformState(this.state),
        lastError: reason ?? this.state.lastError,
        status: this.source ? "error" : "idle",
        updatedAt: new Date().toISOString(),
      }
      this.emitState()
    })

    source.on("error", (error: Error) => {
      this.state = {
        ...applyAutomationPolicyToPlatformState(this.state),
        lastError: error.message,
        status: "error",
        updatedAt: new Date().toISOString(),
      }
      this.emitState()
    })

    source.on("viewer-event", (event: PlatformViewerEvent) => {
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
