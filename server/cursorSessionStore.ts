import path from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"

const CURSOR_SESSION_STORE_DIR = path.join(process.cwd(), ".cursor", "runtime", "chat-sessions")

export type CursorChatSessionRecord = {
  agentId: string
  browserSessionId: string
  characterStateSignature: string
  createdAt: string
  lastRunId?: string
  lastRunStatus?: "cancelled" | "error" | "finished" | "running"
  model: string
  updatedAt: string
}

export async function readCursorChatSessionRecord(browserSessionId: string) {
  try {
    const raw = await readFile(resolveCursorSessionPath(browserSessionId), "utf8")
    return JSON.parse(raw) as CursorChatSessionRecord
  } catch (error) {
    if (isMissingFileError(error)) {
      return null
    }

    throw error
  }
}

export async function writeCursorChatSessionRecord(record: CursorChatSessionRecord) {
  await mkdir(CURSOR_SESSION_STORE_DIR, { recursive: true })
  await writeFile(resolveCursorSessionPath(record.browserSessionId), `${JSON.stringify(record)}\n`, "utf8")
}

function resolveCursorSessionPath(browserSessionId: string) {
  return path.join(CURSOR_SESSION_STORE_DIR, `${sanitizeCursorSessionId(browserSessionId)}.json`)
}

function sanitizeCursorSessionId(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_")
}

function isMissingFileError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}
