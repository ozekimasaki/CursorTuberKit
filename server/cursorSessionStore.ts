import path from "node:path"
import type { CursorPromptMode } from "../shared/cursorPrompt.js"
import type { CursorTokenUsage } from "./cursorTypes.js"
import { readJsonFileSafe, writeJsonFileAtomic } from "./cursorAgentUtils.js"

const CURSOR_SESSION_STORE_DIR = path.join(process.cwd(), ".cursor", "runtime", "chat-sessions")
const sessionWriteQueues = new Map<string, Promise<void>>()

export type CursorChatSessionRecord = {
  agentId: string
  browserSessionId: string
  characterStateSignature: string
  createdAt: string
  lastPromptMode?: CursorPromptMode
  lastRunId?: string
  lastRunStatus?: "cancelled" | "error" | "finished" | "running"
  lastUsage?: CursorTokenUsage | null
  model: string
  updatedAt: string
}

export async function readCursorChatSessionRecord(browserSessionId: string) {
  const sessionPath = resolveCursorSessionPath(browserSessionId)

  try {
    const result = await readJsonFileSafe<CursorChatSessionRecord>(sessionPath)

    if (result.status === "ok") {
      return isCursorChatSessionRecord(result.value) ? result.value : null
    }

    if (result.status === "recovered") {
      if (!isCursorChatSessionRecord(result.value)) {
        console.warn(`Cursor chat session was recovered but has invalid shape, ignoring: ${sessionPath}`)
        return null
      }

      console.warn(`Cursor chat session recovered: ${sessionPath}. ${result.detail}`)
      await writeCursorChatSessionRecord(result.value)
      return result.value
    }

    if (result.status === "empty") {
      console.warn(`Cursor chat session was empty, starting fresh: ${sessionPath}`)
      return null
    }

    console.warn(`Cursor chat session was invalid, starting fresh: ${sessionPath}. ${result.error.message}`)
    return null
  } catch (error) {
    if (isMissingFileError(error)) {
      return null
    }

    throw error
  }
}

export async function writeCursorChatSessionRecord(record: CursorChatSessionRecord) {
  const sessionPath = resolveCursorSessionPath(record.browserSessionId)
  const previous = sessionWriteQueues.get(sessionPath) ?? Promise.resolve()
  const next = previous
    .catch(() => undefined)
    .then(() => writeJsonFileAtomic(sessionPath, record))
    .finally(() => {
      if (sessionWriteQueues.get(sessionPath) === next) {
        sessionWriteQueues.delete(sessionPath)
      }
    })

  sessionWriteQueues.set(sessionPath, next)
  await next
}

function resolveCursorSessionPath(browserSessionId: string) {
  return path.join(CURSOR_SESSION_STORE_DIR, `${sanitizeCursorSessionId(browserSessionId)}.json`)
}

function sanitizeCursorSessionId(value: string) {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, "_")
  return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(sanitized) ? `_${sanitized}` : sanitized
}

function isMissingFileError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function isCursorChatSessionRecord(value: unknown): value is CursorChatSessionRecord {
  if (typeof value !== "object" || value === null) {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    typeof record.agentId === "string" &&
    record.agentId.length > 0 &&
    typeof record.browserSessionId === "string" &&
    record.browserSessionId.length > 0 &&
    typeof record.characterStateSignature === "string" &&
    record.characterStateSignature.length > 0 &&
    typeof record.createdAt === "string" &&
    typeof record.model === "string" &&
    record.model.length > 0 &&
    typeof record.updatedAt === "string" &&
    (record.lastPromptMode === undefined ||
      record.lastPromptMode === "full-context" ||
      record.lastPromptMode === "resume-compact") &&
    (record.lastRunId === undefined || typeof record.lastRunId === "string") &&
    (record.lastRunStatus === undefined ||
      record.lastRunStatus === "cancelled" ||
      record.lastRunStatus === "error" ||
      record.lastRunStatus === "finished" ||
      record.lastRunStatus === "running") &&
    (record.lastUsage === undefined || record.lastUsage === null || typeof record.lastUsage === "object")
  )
}
