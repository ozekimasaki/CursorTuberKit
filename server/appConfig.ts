import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

export type AutomationExecutionLevel = "suggestion_only" | "approval_required" | "auto_executable"

export type AppConfig = {
  automation: {
    allowInAppAutoExecute: boolean | null
    maxExecutionLevel: AutomationExecutionLevel
  }
  client: {
    port: number
  }
  cursor: {
    autopilotModel: string
    characterModel: string
    emotionModel: string
    model: string
    personaCuratorModel: string
  }
  mcp: {
    discoveryUrls: string[]
  }
  memkraft: {
    agentId: string
    channelId: string
    container: {
      image: string
      name: string
      runtime: string
      workdir: string
    }
    dir: string
    executionMode: "local" | "container"
    pythonBin: string
  }
  runtime: {
    nodeExecutable: string | null
  }
  server: {
    port: number
  }
  voicevox: {
    container: {
      image: string
      name: string
      port: number
      runtime: string
    }
    defaultSpeakerId: number
    url: string
  }
}

let cachedConfig: AppConfig | null = null

export function readAppConfig(): AppConfig {
  cachedConfig ??= loadConfig()
  return cachedConfig
}

export function resetAppConfigCacheForTest() {
  cachedConfig = null
}

function loadConfig(): AppConfig {
  rejectLegacyEnv()
  const defaults = readJson(path.resolve(process.cwd(), "config", "defaults.json"))
  const localPath = path.resolve(process.cwd(), "config", "local.json")
  const local = existsSync(localPath) ? readJson(localPath) : {}
  return normalizeAppConfig(deepMerge(defaults, local))
}

function normalizeAppConfig(value: unknown): AppConfig {
  if (!isRecord(value)) throw new Error("config/defaults.json must contain an object.")
  const server = readRecord(value.server, "config.server")
  const client = readRecord(value.client, "config.client")
  const cursor = readRecord(value.cursor, "config.cursor")
  const automation = readRecord(value.automation, "config.automation")
  const voicevox = readRecord(value.voicevox, "config.voicevox")
  const voicevoxContainer = readRecord(voicevox.container, "config.voicevox.container")
  const memkraft = readRecord(value.memkraft, "config.memkraft")
  const memkraftContainer = readRecord(memkraft.container, "config.memkraft.container")
  const mcp = readRecord(value.mcp, "config.mcp")
  const runtime = readRecord(value.runtime, "config.runtime")

  return {
    automation: {
      allowInAppAutoExecute:
        typeof automation.allowInAppAutoExecute === "boolean" ? automation.allowInAppAutoExecute : null,
      maxExecutionLevel: readExecutionLevel(automation.maxExecutionLevel),
    },
    client: {
      port: readPort(client.port, "config.client.port"),
    },
    cursor: {
      autopilotModel: readString(cursor.autopilotModel, "config.cursor.autopilotModel"),
      characterModel: readString(cursor.characterModel, "config.cursor.characterModel"),
      emotionModel: readString(cursor.emotionModel, "config.cursor.emotionModel"),
      model: readString(cursor.model, "config.cursor.model"),
      personaCuratorModel: readString(cursor.personaCuratorModel, "config.cursor.personaCuratorModel"),
    },
    mcp: {
      discoveryUrls: Array.isArray(mcp.discoveryUrls)
        ? mcp.discoveryUrls.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
        : [],
    },
    memkraft: {
      agentId: readString(memkraft.agentId, "config.memkraft.agentId"),
      channelId: readString(memkraft.channelId, "config.memkraft.channelId"),
      container: {
        image: readString(memkraftContainer.image, "config.memkraft.container.image"),
        name: readString(memkraftContainer.name, "config.memkraft.container.name"),
        runtime: readString(memkraftContainer.runtime, "config.memkraft.container.runtime"),
        workdir: readString(memkraftContainer.workdir, "config.memkraft.container.workdir"),
      },
      dir: readString(memkraft.dir, "config.memkraft.dir"),
      executionMode: memkraft.executionMode === "local" ? "local" : "container",
      pythonBin: readString(memkraft.pythonBin, "config.memkraft.pythonBin"),
    },
    runtime: {
      nodeExecutable: typeof runtime.nodeExecutable === "string" ? runtime.nodeExecutable : null,
    },
    server: {
      port: readPort(server.port, "config.server.port"),
    },
    voicevox: {
      container: {
        image: readString(voicevoxContainer.image, "config.voicevox.container.image"),
        name: readString(voicevoxContainer.name, "config.voicevox.container.name"),
        port: readPort(voicevoxContainer.port, "config.voicevox.container.port"),
        runtime: readString(voicevoxContainer.runtime, "config.voicevox.container.runtime"),
      },
      defaultSpeakerId: readNonNegativeInteger(voicevox.defaultSpeakerId, "config.voicevox.defaultSpeakerId"),
      url: readString(voicevox.url, "config.voicevox.url"),
    },
  }
}

function rejectLegacyEnv() {
  const legacy = [
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
    "NODE_EXECUTABLE",
  ].filter((key) => process.env[key] != null)

  if (legacy.length > 0) {
    throw new Error(`Move non-secret env settings to config/local.json: ${legacy.join(", ")}`)
  }
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8")) as unknown
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (!isRecord(base) || !isRecord(override)) return override
  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    result[key] = isRecord(value) && isRecord(result[key]) ? deepMerge(result[key], value) : value
  }
  return result
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`)
  return value
}

function readString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`)
  }
  return value
}

function readPort(value: unknown, label: string): number {
  const port = readNonNegativeInteger(value, label)
  if (port <= 0 || port > 65535) throw new Error(`${label} must be a valid TCP port.`)
  return port
}

function readNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`)
  }
  return value
}

function readExecutionLevel(value: unknown): AutomationExecutionLevel {
  if (value === "suggestion_only" || value === "approval_required" || value === "auto_executable") return value
  throw new Error("config.automation.maxExecutionLevel is invalid.")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
