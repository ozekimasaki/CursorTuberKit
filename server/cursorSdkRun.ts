import type { Run } from "@cursor/sdk"
import type { CursorTokenUsage, CursorToolCallTelemetry } from "./cursorTypes.js"

type CursorRunCollectionOptions = {
  onText?: (text: string) => void
  signal?: AbortSignal
}

export type CursorCollectedRun = {
  status: string
  statusHistory: string[]
  text: string
  toolCalls: CursorToolCallTelemetry[]
  usage: CursorTokenUsage | null
}

export async function collectCursorRun(run: Run, options: CursorRunCollectionOptions = {}): Promise<CursorCollectedRun> {
  const statusHistory: string[] = [run.status]
  const toolCalls: CursorToolCallTelemetry[] = []
  let text = ""
  let usage: CursorTokenUsage | null = null
  let cancelPromise: Promise<void> | null = null
  const cancelRunOnce = () => {
    if (!cancelPromise) {
      cancelPromise = run.cancel().catch(() => undefined)
    }
    return cancelPromise
  }
  const onAbort = () => {
    void cancelRunOnce()
  }

  if (options.signal?.aborted) {
    await cancelRunOnce()
    throw createAbortError()
  }

  options.signal?.addEventListener("abort", onAbort, { once: true })

  const stopStatusSubscription = run.onDidChangeStatus((status) => {
    if (statusHistory.at(-1) !== status) {
      statusHistory.push(status)
    }
  })

  try {
    for await (const event of run.stream()) {
      if (options.signal?.aborted) {
        throw createAbortError()
      }
      if (event.type === "assistant") {
        for (const block of event.message.content) {
          if (block.type === "text" && block.text) {
            text += block.text
            options.onText?.(block.text)
          }
        }
        continue
      }

      if (event.type === "tool_call") {
        toolCalls.push({
          name: event.name,
          status: event.status,
          truncated: isToolCallTruncated(event.truncated),
        })
        continue
      }

      if (event.type === "status") {
        if (statusHistory.at(-1) !== event.status) {
          statusHistory.push(event.status)
        }
        continue
      }

      const turnUsage = readTurnEndedUsage(event)

      if (turnUsage) {
        usage = {
          cacheReadTokens: normalizeTokenCount(turnUsage.cacheReadTokens),
          cacheWriteTokens: normalizeTokenCount(turnUsage.cacheWriteTokens),
          inputTokens: normalizeTokenCount(turnUsage.inputTokens),
          outputTokens: normalizeTokenCount(turnUsage.outputTokens),
        }
      }
    }

    if (options.signal?.aborted) {
      throw createAbortError()
    }

    const result = await run.wait()

    if (options.signal?.aborted) {
      throw createAbortError()
    }

    if (statusHistory.at(-1) !== result.status) {
      statusHistory.push(result.status)
    }

    return {
      status: result.status,
      statusHistory,
      text,
      toolCalls,
      usage,
    }
  } finally {
    options.signal?.removeEventListener("abort", onAbort)
    stopStatusSubscription()
  }
}

function createAbortError() {
  const error = new Error("Cursor run aborted")
  error.name = "AbortError"
  return error
}

function normalizeTokenCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function isToolCallTruncated(
  value: unknown,
): boolean {
  return isRecord(value) && (value.args === true || value.result === true)
}

function readTurnEndedUsage(value: unknown) {
  if (!isRecord(value) || value.type !== "turn-ended" || !isRecord(value.usage)) {
    return null
  }

  return value.usage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
