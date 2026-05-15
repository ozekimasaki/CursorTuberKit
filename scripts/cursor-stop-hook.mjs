import path from "node:path"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"

const HOOK_STATE_ROOT = path.join(process.cwd(), ".cursor", "hook-state")
const ACTIVE_STATE_DIR = path.join(HOOK_STATE_ROOT, "active")
const ERROR_LOG_PATH = path.join(HOOK_STATE_ROOT, "stop-hook-error.json")

try {
  const chunks = []

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim()
  const payload = raw ? JSON.parse(raw) : {}
  const stateDirs = await resolveStateDirs(payload)

  for (const stateDir of stateDirs) {
    await mkdir(stateDir, { recursive: true })
    await writeFile(
      path.join(stateDir, "stop.json"),
      `${JSON.stringify({ payload, receivedAt: new Date().toISOString() })}\n`,
      "utf8",
    )
  }
} catch (error) {
  await mkdir(HOOK_STATE_ROOT, { recursive: true })
  await writeFile(
    ERROR_LOG_PATH,
    `${JSON.stringify({
      message: error instanceof Error ? error.message : "Unknown stop hook error.",
      receivedAt: new Date().toISOString(),
    })}\n`,
    "utf8",
  )
  process.exitCode = 1
}

async function resolveStateDirs(payload) {
  const stateDirs = new Set()
  const envStateDir = process.env.CURSOR_HOOK_STATE_DIR?.trim()

  if (envStateDir) {
    stateDirs.add(envStateDir)
  }

  const manifestKeys = [payload?.generation_id, payload?.conversation_id].filter(
    (value) => typeof value === "string" && value.trim().length > 0,
  )

  for (const key of manifestKeys) {
    const manifest = await readManifest(key)

    if (manifest?.stateDir) {
      stateDirs.add(manifest.stateDir)
    }
  }

  if (stateDirs.size === 0) {
    const manifests = await readAllManifests()

    if (manifests.length === 1) {
      stateDirs.add(manifests[0].stateDir)
    }
  }

  return stateDirs
}

async function readManifest(key) {
  try {
    const raw = await readFile(path.join(ACTIVE_STATE_DIR, `${sanitizeKey(key)}.json`), "utf8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function readAllManifests() {
  try {
    const entries = await readdir(ACTIVE_STATE_DIR)
    const manifests = await Promise.all(entries.map((entry) => readManifest(entry.replace(/\.json$/, ""))))
    return manifests.filter((manifest) => manifest && typeof manifest.stateDir === "string")
  } catch {
    return []
  }
}

function sanitizeKey(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_")
}
