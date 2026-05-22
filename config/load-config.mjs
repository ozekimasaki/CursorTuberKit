import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const CONFIG_DIR = "config"
const DEFAULTS_FILE = "defaults.json"
const LOCAL_FILE = "local.json"

export const legacyEnvKeys = [
  "AI_PROVIDER",
  "PORT",
  "VITE_PORT",
  "CURSOR_MODEL",
  "CURSOR_CHARACTER_MODEL",
  "CURSOR_EMOTION_MODEL",
  "CURSOR_AUTOPILOT_MODEL",
  "CURSOR_PERSONA_CURATOR_MODEL",
  "AUTOMATION_MAX_EXECUTION_LEVEL",
  "AUTOMATION_ALLOW_IN_APP_AUTO_EXECUTE",
  "VOICEVOX_URL",
  "VOICEVOX_SPEAKER",
  "VOICEVOX_CONTAINER_RUNTIME",
  "VOICEVOX_CONTAINER_NAME",
  "VOICEVOX_IMAGE",
  "VOICEVOX_PORT",
  "MEMKRAFT_DIR",
  "MEMKRAFT_EXECUTION_MODE",
  "MEMKRAFT_PYTHON_BIN",
  "MEMKRAFT_AGENT_ID",
  "MEMKRAFT_CHANNEL_ID",
  "MEMKRAFT_CONTAINER_RUNTIME",
  "MEMKRAFT_CONTAINER_NAME",
  "MEMKRAFT_CONTAINER_IMAGE",
  "MEMKRAFT_CONTAINER_WORKDIR",
  "MCP_DISCOVERY_URL",
  "MCP_DISCOVERY_URLS",
  "NODE_EXECUTABLE"
]

const schema = {
  server: { port: "number" },
  client: { port: "number" },
  cursor: {
    model: "string",
    characterModel: "string",
    emotionModel: "string",
    autopilotModel: "string",
    personaCuratorModel: "string"
  },
  automation: {
    maxExecutionLevel: ["suggestion_only", "approval_required", "auto_executable"],
    allowInAppAutoExecute: ["boolean", "null"]
  },
  voicevox: {
    url: "string",
    defaultSpeakerId: "number",
    container: {
      runtime: "string",
      name: "string",
      image: "string",
      port: "number"
    }
  },
  memkraft: {
    dir: "string",
    executionMode: ["local", "container"],
    pythonBin: "string",
    agentId: "string",
    channelId: "string",
    container: {
      runtime: "string",
      name: "string",
      image: "string",
      workdir: "string"
    }
  },
  mcp: {
    discoveryUrls: "string[]"
  },
  runtime: {
    nodeExecutable: ["string", "null"]
  }
}

export function loadAppConfig(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  if (options.rejectLegacyEnv !== false) {
    rejectLegacyEnv(cwd)
  }

  const defaults = readJsonFile(path.join(cwd, CONFIG_DIR, DEFAULTS_FILE), true)
  const localPath = path.join(cwd, CONFIG_DIR, LOCAL_FILE)
  const local = existsSync(localPath) ? readJsonFile(localPath, true) : {}
  const merged = deepMerge(defaults, local)
  validateConfig(merged, schema, "config")
  return merged
}

export function rejectLegacyEnv(cwd = process.cwd()) {
  const examplePath = path.join(cwd, ".env.example")
  const exampleText = existsSync(examplePath) ? readFileSync(examplePath, "utf8") : ""
  const offenders = legacyEnvKeys.filter((key) => process.env[key] != null && !exampleText.includes(`${key}=`))
  if (offenders.length > 0) {
    throw new Error(
      `Non-secret environment settings moved to config/local.json. Remove these env vars: ${offenders.join(", ")}`
    )
  }
}

function readJsonFile(filePath, required) {
  if (!existsSync(filePath)) {
    if (required) throw new Error(`Config file not found: ${filePath}`)
    return {}
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf8"))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON"
    throw new Error(`Failed to parse ${filePath}: ${message}`)
  }
}

function deepMerge(base, override) {
  if (!isRecord(base) || !isRecord(override)) return override
  const result = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (isRecord(value) && isRecord(result[key])) {
      result[key] = deepMerge(result[key], value)
    } else {
      result[key] = value
    }
  }
  return result
}

function validateConfig(value, shape, pathLabel) {
  if (!isRecord(value)) throw new Error(`${pathLabel} must be an object.`)

  for (const key of Object.keys(value)) {
    if (!(key in shape)) throw new Error(`Unknown config key: ${pathLabel}.${key}`)
  }

  for (const [key, expected] of Object.entries(shape)) {
    const child = value[key]
    const label = `${pathLabel}.${key}`
    if (isRecord(expected)) {
      validateConfig(child, expected, label)
    } else {
      validateValue(child, expected, label)
    }
  }
}

function validateValue(value, expected, label) {
  const candidates = Array.isArray(expected) ? expected : [expected]
  for (const candidate of candidates) {
    if (candidate === "null" && value === null) return
    if (candidate === "string[]" && Array.isArray(value) && value.every((item) => typeof item === "string")) return
    if (candidate === "number" && typeof value === "number" && Number.isFinite(value)) return
    if (candidate === "string" && typeof value === "string") return
    if (candidate === "boolean" && typeof value === "boolean") return
    if (typeof candidate === "string" && value === candidate) return
  }
  throw new Error(`Invalid config value for ${label}.`)
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
