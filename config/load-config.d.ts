export type AutomationExecutionLevel = "suggestion_only" | "approval_required" | "auto_executable"

export type AppConfig = {
  server: {
    port: number
  }
  client: {
    port: number
  }
  cursor: {
    model: string
    characterModel: string
    emotionModel: string
    autopilotModel: string
    personaCuratorModel: string
  }
  automation: {
    maxExecutionLevel: AutomationExecutionLevel
    allowInAppAutoExecute: boolean | null
  }
  voicevox: {
    url: string
    defaultSpeakerId: number
    container: {
      runtime: string
      name: string
      image: string
      port: number
    }
  }
  memkraft: {
    dir: string
    executionMode: "local" | "container"
    pythonBin: string
    agentId: string
    channelId: string
    container: {
      runtime: string
      name: string
      image: string
      workdir: string
    }
  }
  mcp: {
    discoveryUrls: string[]
  }
  runtime: {
    nodeExecutable: string | null
  }
}

export function loadAppConfig(options?: { cwd?: string; rejectLegacyEnv?: boolean }): AppConfig
export function rejectLegacyEnv(cwd?: string): void
export const legacyEnvKeys: string[]
