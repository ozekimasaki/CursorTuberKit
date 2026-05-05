import { EventEmitter } from "node:events"
import type { PlatformChatMode, PlatformViewerEvent } from "../shared/platformChat.js"

export abstract class PlatformChatSource extends EventEmitter {
  constructor(public readonly mode: PlatformChatMode) {
    super()
  }

  abstract connect(target: string): Promise<void>
  abstract disconnect(): Promise<void>

  protected emitConnected() {
    this.emit("connected")
  }

  protected emitDisconnected(reason?: string) {
    this.emit("disconnected", reason)
  }

  protected emitSourceError(error: Error) {
    this.emit("error", error)
  }

  protected emitViewerEvent(event: PlatformViewerEvent) {
    this.emit("viewer-event", event)
  }
}

export function asError(error: unknown, fallback: string) {
  return error instanceof Error ? error : new Error(fallback)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function normalizePlatformTarget(target: string) {
  return target.trim()
}

export function normalizeViewerText(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim()
}

export function numberToCssColor(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined
  }

  const rgb = value & 0xffffff
  return `#${rgb.toString(16).padStart(6, "0")}`
}

