import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"
import type { CursorRunTelemetryRecord } from "./cursorTypes.js"

const CURSOR_TELEMETRY_DIR = path.resolve(process.cwd(), "memory", "runtime")
export const CURSOR_TELEMETRY_FILE = path.join(CURSOR_TELEMETRY_DIR, "cursor-telemetry.ndjson")

export async function appendCursorTelemetry(record: CursorRunTelemetryRecord) {
  await mkdir(CURSOR_TELEMETRY_DIR, { recursive: true })
  await appendFile(CURSOR_TELEMETRY_FILE, `${JSON.stringify(record)}\n`, "utf8")
}
