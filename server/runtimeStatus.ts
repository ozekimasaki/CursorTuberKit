import { appendFile, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { CharacterArtifactsPayload } from "../shared/characterAgents.js"
import type { CursorPromptMode } from "../shared/cursorPrompt.js"
import type { CharacterStateMetadata } from "../shared/characterState.js"
import type { FinalEmotionPayload } from "../shared/emotion.js"
import { createIdlePlatformChatState, type PlatformChatState } from "../shared/platformChat.js"
import type { AiProvider } from "./aiProvider.js"
import {
  CHARACTER_ARTIFACT_FILES,
  type CharacterArtifactPersistenceSummary,
} from "./characterArtifacts.js"
import { CURSOR_TELEMETRY_FILE } from "./cursorTelemetry.js"
import type { VoicevoxHealth } from "./voicevox.js"

const RECENT_RUN_LIMIT = 12
const PREVIEW_LIMIT = 220
const ARTIFACT_DIR = path.resolve(process.cwd(), "memory", "runtime")
const CHARACTER_AGENT_LOG_FILE = path.join(ARTIFACT_DIR, "character-agents.ndjson")
const RUN_LOG_FILE = path.join(ARTIFACT_DIR, "chat-runs.ndjson")
const STATUS_FILE = path.join(ARTIFACT_DIR, "status.json")

type ActiveChatRun = {
  characterArtifacts: CharacterArtifactsPayload | null
  characterStateSignature: string
  emotion: FinalEmotionPayload | null
  promptLength: number
  promptMode: CursorPromptMode
  provider: AiProvider
  recentTurnsCount: number
  responseLength: number
  responsePreview: string
  startedAt: string
}

export type ChatRunRecap = {
  characterArtifacts: CharacterArtifactsPayload | null
  characterMemoryPersisted: boolean
  characterStateSignature: string
  durationMs: number
  emotion: FinalEmotionPayload | null
  error: string | null
  finishedAt: string
  id: string
  memKraftPersisted: boolean
  promptLength: number
  promptMode: CursorPromptMode
  provider: AiProvider
  recentTurnsCount: number
  responseLength: number
  responsePreview: string
  startedAt: string
  status: "aborted" | "completed" | "error"
}

type RuntimeStatusSnapshot = {
  artifacts: {
      characterAgentLog: string
      characterArtifactsHistoryLog: string
      characterArtifactsLatest: string
      cursorTelemetryLog: string
      loreCardsFile: string
      recentRunsLog: string
      relationshipsFile: string
    statusFile: string
    streamDiaryFile: string
    teaserFile: string
  }
  chatRuns: {
    active: Array<{
      characterStateSignature: string
      id: string
      provider: AiProvider
      startedAt: string
    }>
    recent: ChatRunRecap[]
  }
  characterMemory: {
    diaryTitle: string | null
    generatedAt: string | null
    loreCardCount: number
    relationshipCount: number
    teaserHeadline: string | null
    teaserHook: string | null
  }
  characterState: CharacterStateMetadata | null
  generatedAt: string
  platformChat: PlatformChatState
  process: {
    pid: number
    runtime: "bun" | "node"
    uptimeSeconds: number
    version: string
  }
  voicevox: {
    lastCheckedAt: string | null
    lastKnownHealth: VoicevoxHealth | null
  }
}

export class RuntimeStatusTracker {
  private readonly activeChatRuns = new Map<string, ActiveChatRun>()
  private readonly recentChatRuns: ChatRunRecap[] = []
  private artifactWriteQueue = Promise.resolve()
  private characterMemorySummary: CharacterArtifactPersistenceSummary | null = null
  private characterState: CharacterStateMetadata | null = null
  private platformChatState: PlatformChatState = createIdlePlatformChatState()
  private voicevoxCheckedAt: string | null = null
  private voicevoxHealth: VoicevoxHealth | null = null

  recordCharacterState(state: CharacterStateMetadata) {
    this.characterState = copyCharacterStateMetadata(state)
    this.queueArtifactWrite(() => this.writeStatusSnapshot())
  }

  recordCharacterMemory(summary: CharacterArtifactPersistenceSummary) {
    this.characterMemorySummary = {
      ...summary,
      artifacts: {
        ...summary.artifacts,
      },
    }
    this.queueArtifactWrite(() => this.writeStatusSnapshot())
  }

  recordPlatformChatState(state: PlatformChatState) {
    this.platformChatState = { ...state }
    this.queueArtifactWrite(() => this.writeStatusSnapshot())
  }

  recordVoicevoxHealth(health: VoicevoxHealth) {
    this.voicevoxCheckedAt = new Date().toISOString()
    this.voicevoxHealth = { ...health }
    this.queueArtifactWrite(() => this.writeStatusSnapshot())
  }

  startChatRun(input: {
    characterStateSignature: string
    provider: AiProvider
    promptLength: number
    recentTurnsCount: number
  }) {
    const id = createRunId()
    this.activeChatRuns.set(id, {
      characterArtifacts: null,
      characterStateSignature: input.characterStateSignature,
      emotion: null,
      promptLength: input.promptLength,
      promptMode: "full-context",
      provider: input.provider,
      recentTurnsCount: input.recentTurnsCount,
      responseLength: 0,
      responsePreview: "",
      startedAt: new Date().toISOString(),
    })
    this.queueArtifactWrite(() => this.writeStatusSnapshot())
    return id
  }

  appendChatText(runId: string, text: string) {
    const run = this.activeChatRuns.get(runId)

    if (!run) {
      return
    }

    run.responseLength += text.length
    run.responsePreview = appendPreview(run.responsePreview, text, PREVIEW_LIMIT)
  }

  setChatEmotion(runId: string, emotion: FinalEmotionPayload) {
    const run = this.activeChatRuns.get(runId)

    if (!run) {
      return
    }

    run.emotion = emotion
  }

  setChatPromptDetails(
    runId: string,
    input: {
      promptLength: number
      promptMode: CursorPromptMode
    },
  ) {
    const run = this.activeChatRuns.get(runId)

    if (!run) {
      return
    }

    run.promptLength = input.promptLength
    run.promptMode = input.promptMode
  }

  setChatCharacterArtifacts(runId: string, artifacts: CharacterArtifactsPayload) {
    const run = this.activeChatRuns.get(runId)

    if (!run) {
      return
    }

    run.characterArtifacts = copyCharacterArtifactsPayload(artifacts)
  }

  finishChatRun(
    runId: string,
    output: {
      characterMemoryPersisted?: boolean
      error?: string | null
      memKraftPersisted?: boolean
      status: ChatRunRecap["status"]
    },
  ) {
    const run = this.activeChatRuns.get(runId)

    if (!run) {
      return null
    }

    this.activeChatRuns.delete(runId)
    const finishedAt = new Date().toISOString()
    const recap: ChatRunRecap = {
      characterArtifacts: run.characterArtifacts ? copyCharacterArtifactsPayload(run.characterArtifacts) : null,
      characterMemoryPersisted: output.characterMemoryPersisted === true,
      characterStateSignature: run.characterStateSignature,
      durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(run.startedAt)),
      emotion: run.emotion,
      error: output.error?.trim() || null,
      finishedAt,
      id: runId,
      memKraftPersisted: output.memKraftPersisted === true,
      promptLength: run.promptLength,
      promptMode: run.promptMode,
      provider: run.provider,
      recentTurnsCount: run.recentTurnsCount,
      responseLength: run.responseLength,
      responsePreview: run.responsePreview,
      startedAt: run.startedAt,
      status: output.status,
    }

    this.recentChatRuns.unshift(recap)
    if (this.recentChatRuns.length > RECENT_RUN_LIMIT) {
      this.recentChatRuns.length = RECENT_RUN_LIMIT
    }

    console.info(JSON.stringify({ scope: "chat-run", ...recap }))
    this.queueArtifactWrite(async () => {
      await ensureArtifactDir()
      if (recap.characterArtifacts) {
        await appendFile(
          CHARACTER_AGENT_LOG_FILE,
          `${JSON.stringify({ runId: recap.id, generatedAt: recap.finishedAt, payload: recap.characterArtifacts })}\n`,
          "utf8",
        )
      }
      await appendFile(RUN_LOG_FILE, `${JSON.stringify(recap)}\n`, "utf8")
      await this.writeStatusSnapshot()
    })
    return recap
  }

  getSnapshot(): RuntimeStatusSnapshot {
    return {
      artifacts: {
        characterAgentLog: path.relative(process.cwd(), CHARACTER_AGENT_LOG_FILE),
        characterArtifactsHistoryLog: path.relative(process.cwd(), CHARACTER_ARTIFACT_FILES.historyLogFile),
        characterArtifactsLatest: path.relative(process.cwd(), CHARACTER_ARTIFACT_FILES.latestBundleFile),
        cursorTelemetryLog: path.relative(process.cwd(), CURSOR_TELEMETRY_FILE),
        loreCardsFile: path.relative(process.cwd(), CHARACTER_ARTIFACT_FILES.loreCardsFile),
        recentRunsLog: path.relative(process.cwd(), RUN_LOG_FILE),
        relationshipsFile: path.relative(process.cwd(), CHARACTER_ARTIFACT_FILES.relationshipsFile),
        statusFile: path.relative(process.cwd(), STATUS_FILE),
        streamDiaryFile: path.relative(process.cwd(), CHARACTER_ARTIFACT_FILES.streamDiaryFile),
        teaserFile: path.relative(process.cwd(), CHARACTER_ARTIFACT_FILES.teaserFile),
      },
      chatRuns: {
        active: [...this.activeChatRuns.entries()].map(([id, run]) => ({
          characterStateSignature: run.characterStateSignature,
          id,
          provider: run.provider,
          startedAt: run.startedAt,
        })),
        recent: [...this.recentChatRuns],
      },
      characterMemory: {
        diaryTitle: this.characterMemorySummary?.diaryTitle ?? null,
        generatedAt: this.characterMemorySummary?.generatedAt ?? null,
        loreCardCount: this.characterMemorySummary?.loreCardCount ?? 0,
        relationshipCount: this.characterMemorySummary?.relationshipCount ?? 0,
        teaserHeadline: this.characterMemorySummary?.teaserHeadline ?? null,
        teaserHook: this.characterMemorySummary?.teaserHook ?? null,
      },
      characterState: this.characterState ? copyCharacterStateMetadata(this.characterState) : null,
      generatedAt: new Date().toISOString(),
      platformChat: { ...this.platformChatState },
      process: {
        pid: process.pid,
        runtime: typeof globalThis === "object" && "Bun" in globalThis ? "bun" : "node",
        uptimeSeconds: Math.round(process.uptime()),
        version: process.version,
      },
      voicevox: {
        lastCheckedAt: this.voicevoxCheckedAt,
        lastKnownHealth: this.voicevoxHealth ? { ...this.voicevoxHealth } : null,
      },
    }
  }

  private queueArtifactWrite(task: () => Promise<void>) {
    this.artifactWriteQueue = this.artifactWriteQueue
      .then(task)
      .catch((error) => {
        console.warn(
          `Runtime status artifact update failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      })
  }

  private async writeStatusSnapshot() {
    await ensureArtifactDir()
    await writeFile(STATUS_FILE, `${JSON.stringify(this.getSnapshot(), null, 2)}\n`, "utf8")
  }
}

async function ensureArtifactDir() {
  await mkdir(ARTIFACT_DIR, { recursive: true })
}

function appendPreview(current: string, text: string, limit: number) {
  if (current.length >= limit) {
    return current
  }

  const next = `${current}${text}`.replace(/\s+/g, " ").trim()
  return next.length <= limit ? next : `${next.slice(0, Math.max(0, limit - 1))}…`
}

function createRunId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function copyCharacterStateMetadata(state: CharacterStateMetadata): CharacterStateMetadata {
  return {
    ...state,
    hookPhases: [...state.hookPhases],
  }
}

function copyCharacterArtifactsPayload(payload: CharacterArtifactsPayload): CharacterArtifactsPayload {
  return {
    ...payload,
    agentUsage: { ...payload.agentUsage },
    director: {
      ...payload.director,
      deliveryStyle: [...payload.director.deliveryStyle],
      sevenDeadlySins: { ...payload.director.sevenDeadlySins },
    },
    lore: {
      ...payload.lore,
      canonFacts: [...payload.lore.canonFacts],
      continuityNotes: [...payload.lore.continuityNotes],
      memoryCandidates: [...payload.lore.memoryCandidates],
      openLoops: [...payload.lore.openLoops],
    },
    relationship: {
      ...payload.relationship,
      boundaries: [...payload.relationship.boundaries],
      callbacks: [...payload.relationship.callbacks],
    },
    warnings: [...payload.warnings],
    writer: {
      ...payload.writer,
      segments: payload.writer.segments.map((segment) => ({ ...segment })),
    },
  }
}
