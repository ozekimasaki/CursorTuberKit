import { randomUUID } from "node:crypto"
import { access, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { Agent, CursorSdkError, type Run, type SDKAgent } from "@cursor/sdk"
import { characterSinNames, normalizeCharacterSinValues, type CharacterSinName } from "../shared/characterState.js"
import type { CursorPromptMode } from "../shared/cursorPrompt.js"
import type { ChatActionPayload, ChatMetadataPayload, ChatSessionPayload } from "../shared/chatStream.js"
import type { CharacterArtifactsPayload } from "../shared/characterAgents.js"
import { characterProfile } from "../shared/characterProfile.js"
import { inferEmotionFromText, type FinalEmotionPayload } from "../shared/emotion.js"
import { deriveCharacterArtifacts } from "./characterAgents.js"
import { readCharacterRuntimeSinValues, updateCharacterRuntimeSinValuesFromHook } from "./characterRuntimeState.js"
import { collectCursorRun } from "./cursorSdkRun.js"
import {
  readCursorChatSessionRecord,
  writeCursorChatSessionRecord,
  type CursorChatSessionRecord,
} from "./cursorSessionStore.js"
import { appendCursorTelemetry } from "./cursorTelemetry.js"
import type { CursorRunTelemetryRecord, CursorToolCallTelemetry } from "./cursorTypes.js"
import { createCursorLocalOptions } from "./cursorLocalOptions.js"
import { extractJsonObjectSafe } from "./cursorAgentUtils.js"

type CursorWorkerInput = {
  compactPrompt?: string
  compiledPrompt: string
  inputKind?: "viewer-comment" | "self-driven"
  route: ChatMetadataPayload
  session: {
    browserSessionId: string
    transport: "cookie"
  }
}

type CursorWorkerOutput =
  | { type: "action"; payload: ChatActionPayload }
  | { type: "character-artifacts"; payload: CharacterArtifactsPayload }
  | { type: "done" }
  | { type: "emotion"; payload: FinalEmotionPayload }
  | { type: "error"; message: string }
  | { type: "session"; payload: ChatSessionPayload }
  | { type: "text"; text: string }

type StopHookPayload = {
  payload?: {
    status?: string
    conversation_id?: string
    generation_id?: string
    hook_event_name?: string
    loop_count?: number
  }
  receivedAt?: string
}

type HookEmotionDriftResult = {
  applied: boolean
  detail: string
  telemetry: CursorRunTelemetryRecord | null
}

const HOOK_ERROR_LOG_PATH = path.join(process.cwd(), ".cursor", "hook-state", "stop-hook-error.json")
const HOOK_MANIFEST_DIR = path.join(process.cwd(), ".cursor", "hook-state", "active")
const HOOK_RUNTIME_DIR = path.join(process.cwd(), ".cursor", "hook-state", "runs")
const STOP_HOOK_FILE_NAME = "stop.json"

export class CursorConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CursorConfigurationError"
  }
}

const apiKey = process.env.CURSOR_API_KEY?.trim()

if (!apiKey) {
  throw new CursorConfigurationError(
    "CURSOR_API_KEY が未設定です。.env または環境変数に Cursor API キーを設定してください。",
  )
}

const input = await readInput()
const model = input.route.model
const selectedModel = { id: model }
const characterAgentModel = input.route.characterAgentModel ?? model
const emotionModel = input.route.emotionModel ?? model
const hookStateDir = resolveHookStateDir(input.session.browserSessionId)

let agent: SDKAgent | null = null
let run: Run | null = null
let cancelPromise: Promise<void> | null = null
let hookManifestPath: string | null = null
let receivedTerminationSignal = false
let sessionRecord: CursorChatSessionRecord | null = null

const setActiveRun = (nextRun: Run) => {
  run = nextRun
  cancelPromise = null
  return nextRun
}

const restoreActiveRun = (nextRun: Run | null) => {
  run = nextRun
  cancelPromise = null
  return nextRun
}

const cancelRun = () => {
  if (!run) {
    return Promise.resolve()
  }

  if (!cancelPromise) {
    cancelPromise = run.cancel().catch(() => undefined)
  }

  return cancelPromise
}

const handleSignal = () => {
  receivedTerminationSignal = true
  process.exitCode = 0
  void cancelRun()
}

process.once("SIGINT", handleSignal)
process.once("SIGTERM", handleSignal)

try {
  await mkdir(hookStateDir, { recursive: true })
  await unlink(HOOK_ERROR_LOG_PATH).catch(() => undefined)
  process.env.CURSOR_HOOK_STATE_DIR = hookStateDir
  sessionRecord = await readCursorChatSessionRecord(input.session.browserSessionId)

  const resumed = await resumeExistingAgent(sessionRecord, input.route.characterState.signature, selectedModel)
  agent =
    resumed ??
    (await Agent.create({
      apiKey,
      local: createCursorLocalOptions(),
      model: selectedModel,
      name: characterProfile.agentName,
    }))

  const promptMode = selectPromptMode(input, resumed)
  const promptToSend = promptMode === "resume-compact" ? input.compactPrompt?.trim() || input.compiledPrompt : input.compiledPrompt
  const promptLength = promptToSend.length

  run = await startCursorRun(agent, promptToSend, selectedModel)
  hookManifestPath = await writeHookManifest(run.id, hookStateDir)

  const previousRunId = sessionRecord?.lastRunId
  const reusedAgent = Boolean(sessionRecord?.agentId)
  const nextSessionRecord = buildSessionRecord(
    sessionRecord,
    agent.agentId,
    input.session.browserSessionId,
    input.route.characterState.signature,
    model,
    run.id,
    "running",
    {
      promptMode,
      usage: null,
    },
  )
  await writeCursorChatSessionRecord(nextSessionRecord)
  sessionRecord = nextSessionRecord

  writeOutput({
    type: "session",
    payload: {
      browserSessionId: input.session.browserSessionId,
      characterStateSignature: input.route.characterState.signature,
      continuedFromRunId: previousRunId,
      provider: "cursor",
      providerSessionId: agent.agentId,
      promptLength,
      promptMode,
      resumedAgent: Boolean(resumed),
      reusedAgent,
      runId: run.id,
      supportsResume: true,
      transport: input.session.transport,
    },
  })

  const mainRunStartedAt = new Date().toISOString()
  const mainRunResult = await collectCursorRun(run, {
    onText: (text) => {
      writeOutput({ type: "text", text })
    },
  })
  const mainRunFinishedAt = new Date().toISOString()

  sessionRecord = buildSessionRecord(
    sessionRecord,
    agent.agentId,
    input.session.browserSessionId,
    input.route.characterState.signature,
    model,
    run.id,
    normalizeCursorRunStatus(mainRunResult.status),
    {
      promptMode,
      usage: mainRunResult.usage,
    },
  )
  await writeCursorChatSessionRecord(sessionRecord)
  await appendRunTelemetry({
    browserSessionId: input.session.browserSessionId,
    durationMs: Math.max(0, Date.parse(mainRunFinishedAt) - Date.parse(mainRunStartedAt)),
    error: null,
    finishedAt: mainRunFinishedAt,
    model,
    promptLength,
    promptMode,
    providerSessionId: agent.agentId,
    requestRunId: run.id,
    resumedAgent: Boolean(resumed),
    reusedAgent,
    sdkRunId: run.id,
    stage: "main-reply",
    startedAt: mainRunStartedAt,
    status: mainRunResult.status,
    statusHistory: mainRunResult.statusHistory,
    toolCalls: mainRunResult.toolCalls,
    usage: mainRunResult.usage,
  })
  const normalizedResponse = mainRunResult.text.trim()

  if (!normalizedResponse) {
    throw new Error("Cursor から空の応答が返りました。")
  }

  writeAction({
    kind: "character-agents",
    provider: "cursor",
    status: "started",
  })

  const characterArtifactsResult = await deriveCharacterArtifacts({
    apiKey,
    assistantText: normalizedResponse,
    characterStateSignature: input.route.characterState.signature,
    conversationContext: promptToSend,
    model: characterAgentModel,
    session: {
      browserSessionId: input.session.browserSessionId,
      providerSessionId: agent.agentId,
      requestRunId: run.id,
    },
    runState: {
      get: () => run,
      set: restoreActiveRun,
    },
  })
  if (characterArtifactsResult.telemetry) {
    await appendRunTelemetry(characterArtifactsResult.telemetry)
  }

  writeOutput({
    type: "character-artifacts",
    payload: characterArtifactsResult.payload,
  })
  writeAction({
    detail:
      characterArtifactsResult.payload.source === "cursor-subagents"
        ? "Character Director / Lore Keeper / Relationship Manager / Content Writer artifacts were captured."
        : characterArtifactsResult.payload.warnings[0] ?? "Character agent fallback artifacts were captured locally.",
    kind: "character-agents",
    provider: "cursor",
    status: characterArtifactsResult.usedFallback ? "fallback" : "completed",
  })

  writeAction({
    kind: "emotion-finalize",
    provider: "cursor",
    status: "started",
  })

  let finalEmotion: FinalEmotionPayload

  try {
    const stopHookPayload = await waitForStopHookPayload(hookStateDir)
    finalEmotion = deriveFinalEmotionFromArtifacts(
      normalizedResponse,
      characterArtifactsResult.payload,
      Boolean(stopHookPayload),
    )

    if (input.inputKind === "viewer-comment") {
      const hookEmotionDrift = await applyHookDrivenCharacterDrift({
        apiKey,
        artifacts: characterArtifactsResult.payload,
        assistantText: normalizedResponse,
        browserSessionId: input.session.browserSessionId,
        currentSins: await readCharacterRuntimeSinValues(),
        emotionModel,
        providerSessionId: agent.agentId,
        requestRunId: run.id,
        stopHookPayload,
      })
      if (hookEmotionDrift.telemetry) {
        await appendRunTelemetry(hookEmotionDrift.telemetry)
      }
      writeAction({
        detail:
          finalEmotion.source === "cursor-subagent"
            ? `${finalEmotion.hookObserved ? "Character Director の感情分析を stop hook 観測つきで確定しました。" : "Character Director の感情分析を再利用して最終感情を確定しました。"} ${hookEmotionDrift.detail}`
            : `Character artifacts が使えないため本文から感情を推定しました。${hookEmotionDrift.detail}`,
        kind: "emotion-finalize",
        provider: "cursor",
        source: finalEmotion.source,
        status: "completed",
      })
    } else {
      writeAction({
        detail: `inputKind が "${input.inputKind ?? "self-driven"}" のため、seven deadly sins の hidden state 更新をスキップしました。`,
        kind: "emotion-finalize",
        provider: "cursor",
        source: finalEmotion.source,
        status: "skipped",
      })
    }
  } catch (error) {
    if (receivedTerminationSignal) {
      throw error
    }

    const message = error instanceof Error ? error.message : "Unknown error."
    console.warn(`Cursor emotion finalization failed, falling back to text inference: ${message}`)
    finalEmotion = {
      emotion: inferEmotionFromText(normalizedResponse),
      hookObserved: false,
      source: "text-inference",
    }
    writeAction({
      detail: message,
      kind: "emotion-finalize",
      provider: "cursor",
      source: finalEmotion.source,
      status: "fallback",
    })
  }

  writeOutput({ type: "emotion", payload: finalEmotion })
  writeOutput({ type: "done" })
} catch (error) {
  if (!receivedTerminationSignal) {
    writeOutput({
      type: "error",
      message: error instanceof Error ? error.message : "Cursor 応答の生成に失敗しました。",
    })
    process.exitCode = 1
  }
} finally {
  if (receivedTerminationSignal && agent?.agentId && run?.id) {
    await writeCursorChatSessionRecord(
      buildSessionRecord(
        sessionRecord,
        agent.agentId,
        input.session.browserSessionId,
        input.route.characterState.signature,
        model,
        run.id,
        "cancelled",
        {
          promptMode: sessionRecord?.lastPromptMode ?? "full-context",
          usage: sessionRecord?.lastUsage ?? null,
        },
      ),
    ).catch(() => undefined)
  }

  if (agent) {
    if (typeof agent[Symbol.asyncDispose] === "function") {
      await agent[Symbol.asyncDispose]()
    } else {
      agent.close()
    }
  }

  delete process.env.CURSOR_HOOK_STATE_DIR

  const cleanupDelayMs = receivedTerminationSignal ? 0 : (await hasStopHookMarker(hookStateDir)) ? 250 : 2000

  if (cleanupDelayMs > 0) {
    await wait(cleanupDelayMs)
  }

  if (hookManifestPath) {
    await unlink(hookManifestPath).catch(() => undefined)
  }

  await rm(hookStateDir, { force: true, recursive: true })
}

async function readInput() {
  const chunks: Buffer[] = []

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim()

  if (!raw) {
    throw new Error("Cursor worker input is empty.")
  }

  return JSON.parse(raw) as CursorWorkerInput
}

function writeOutput(payload: CursorWorkerOutput) {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

function writeAction(payload: ChatActionPayload) {
  writeOutput({ type: "action", payload })
}

async function appendRunTelemetry(record: CursorRunTelemetryRecord) {
  try {
    await appendCursorTelemetry(record)
  } catch (error) {
    console.warn(`Cursor telemetry write failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function selectPromptMode(input: CursorWorkerInput, resumedAgent: SDKAgent | null): CursorPromptMode {
  return resumedAgent && input.compactPrompt?.trim() ? "resume-compact" : "full-context"
}

async function resumeExistingAgent(
  record: CursorChatSessionRecord | null,
  expectedCharacterStateSignature: string,
  selectedModel: { id: string },
) {
  if (
    !record?.agentId ||
    record.characterStateSignature !== expectedCharacterStateSignature ||
    record.model !== selectedModel.id ||
    record.lastRunStatus === "running"
  ) {
    return null
  }

  try {
    return await Agent.resume(record.agentId, {
      apiKey,
      local: createCursorLocalOptions(),
      model: selectedModel,
    })
  } catch (error) {
    console.warn(
      `Cursor agent resume failed for ${record.agentId}, creating a fresh agent instead: ${
        error instanceof Error ? error.message : "Unknown error."
      }`,
    )
    return null
  }
}

async function startCursorRun(agent: SDKAgent, compiledPrompt: string, selectedModel: { id: string }) {
  try {
    return setActiveRun(
      await agent.send(compiledPrompt, {
        model: selectedModel,
      }),
    )
  } catch (error) {
    if (!shouldForceLocalRunRetry(error)) {
      throw error
    }

    return setActiveRun(
      await agent.send(compiledPrompt, {
        model: selectedModel,
        local: {
          force: true,
        },
      }),
    )
  }
}

function shouldForceLocalRunRetry(error: unknown) {
  if (error instanceof CursorSdkError) {
    if (error.code === "agent_busy" || error.status === 409) {
      return true
    }
  }

  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    message.includes("active run") ||
    message.includes("already running") ||
    message.includes("busy") ||
    message.includes("in progress")
  )
}

function normalizeCursorRunStatus(status: string): CursorChatSessionRecord["lastRunStatus"] {
  switch (status) {
    case "running":
    case "finished":
    case "error":
    case "cancelled":
      return status
    default:
      return "error"
  }
}

function buildSessionRecord(
  existing: CursorChatSessionRecord | null,
  agentId: string,
  browserSessionId: string,
  characterStateSignature: string,
  sessionModel: string,
  runId: string,
  lastRunStatus: CursorChatSessionRecord["lastRunStatus"],
  extras: {
    promptMode: CursorPromptMode
    usage: CursorChatSessionRecord["lastUsage"]
  },
): CursorChatSessionRecord {
  const timestamp = new Date().toISOString()

  return {
    agentId,
    browserSessionId,
    characterStateSignature,
    createdAt: existing?.createdAt ?? timestamp,
    lastPromptMode: extras.promptMode,
    lastRunId: runId,
    lastRunStatus,
    lastUsage: extras.usage,
    model: sessionModel,
    updatedAt: timestamp,
  }
}

function resolveHookStateDir(browserSessionId: string) {
  return path.join(HOOK_RUNTIME_DIR, `${sanitizeHookKey(browserSessionId)}-${process.pid}-${randomUUID()}`)
}

function deriveFinalEmotionFromArtifacts(
  assistantText: string,
  artifacts: CharacterArtifactsPayload,
  hookObserved: boolean,
): FinalEmotionPayload {
  const derivedEmotion = artifacts.director.focusEmotion

  if (!derivedEmotion) {
    return {
      emotion: inferEmotionFromText(assistantText),
      hookObserved,
      source: "text-inference",
    }
  }

  return {
    emotion: derivedEmotion,
    hookObserved,
    source: artifacts.source === "cursor-subagents" ? "cursor-subagent" : "text-inference",
  }
}

async function waitForStopHookPayload(stateDir: string) {
  const hookFilePath = path.join(stateDir, STOP_HOOK_FILE_NAME)

  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await access(hookFilePath)
      const raw = (await readFile(hookFilePath, "utf8")).trim()

      if (!raw) {
        break
      }

      return JSON.parse(raw) as StopHookPayload
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error
      }
    }

    await wait(50)
  }

  const hookError = await readHookErrorLog()

  if (hookError) {
    throw new Error(`Cursor stop hook failed: ${hookError}`)
  }

  console.warn("Cursor stop hook marker was not observed before emotion finalization.")
  return null
}

async function applyHookDrivenCharacterDrift(options: {
  apiKey: string
  artifacts: CharacterArtifactsPayload
  assistantText: string
  browserSessionId: string
  currentSins: Record<CharacterSinName, number>
  emotionModel: string
  providerSessionId: string
  requestRunId: string
  stopHookPayload: StopHookPayload | null
}): Promise<HookEmotionDriftResult> {
  const hookObserved = options.stopHookPayload?.payload?.status === "completed"

  try {
    const analysis = await analyzeHookEmotionDrift(options)
    await updateCharacterRuntimeSinValuesFromHook(analysis.targetSins, options.currentSins)
    return {
      applied: true,
      detail: `${hookObserved ? "Composer 2.5 で hook 後の感情増減を再評価し、hidden state を更新しました。" : "stop hook は観測できませんでしたが、Composer 2.5 で完了済み返答から hidden state を更新しました。"} ${analysis.summary}`,
      telemetry: analysis.telemetry,
    }
  } catch (error) {
    const fallbackTargets =
      options.artifacts.source === "cursor-subagents" ? options.artifacts.director.sevenDeadlySins : null

    if (fallbackTargets) {
      try {
        await updateCharacterRuntimeSinValuesFromHook(fallbackTargets, options.currentSins)
        return {
          applied: true,
          detail: `${hookObserved ? "" : "stop hook は観測できませんでしたが、"}Composer 2.5 の hook 感情分析は失敗したため、Character Director の seven deadly sins を代わりに反映しました。`,
          telemetry: null,
        }
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Unknown fallback hook drift error."
        console.warn(`Cursor hook-driven fallback drift update failed: ${fallbackMessage}`)
      }
    }

    const message = error instanceof Error ? error.message : "Unknown hook drift error."
    console.warn(`Cursor hook-driven character drift update failed: ${message}`)
    return {
      applied: false,
      detail: `hidden state の更新に失敗しました: ${message}`,
      telemetry: null,
    }
  }
}

async function analyzeHookEmotionDrift(options: {
  apiKey: string
  artifacts: CharacterArtifactsPayload
  assistantText: string
  browserSessionId: string
  currentSins: Record<CharacterSinName, number>
  emotionModel: string
  providerSessionId: string
  requestRunId: string
}) {
  const selectedModel = { id: options.emotionModel }
  const analysisAgent = await Agent.create({
    apiKey: options.apiKey,
    local: createCursorLocalOptions(),
    model: selectedModel,
    name: `${characterProfile.agentName} Emotion Drift`,
  })
  const analysisStartedAt = new Date().toISOString()

  try {
    const analysisRun = await analysisAgent.send(buildHookEmotionPrompt(options), {
      model: selectedModel,
    })
    const collectedRun = await collectCursorRun(analysisRun)
    const analysisFinishedAt = new Date().toISOString()

    let analysis: { summary: string; targetSins: Record<CharacterSinName, number> }
    try {
      analysis = normalizeHookEmotionAnalysis(collectedRun.text, options.currentSins)
    } catch (parseErr) {
      console.warn(`[EmotionDrift] JSON parse failed, using fallback. Raw: "${collectedRun.text.substring(0, 200)}"`)
      analysis = {
        summary: "感情分析に失敗したため、現在の状態を維持します。",
        targetSins: { ...options.currentSins },
      }
    }

    return {
      summary: analysis.summary,
      targetSins: analysis.targetSins,
      telemetry: {
        browserSessionId: options.browserSessionId,
        durationMs: Math.max(0, Date.parse(analysisFinishedAt) - Date.parse(analysisStartedAt)),
        error: null,
        finishedAt: analysisFinishedAt,
        model: options.emotionModel,
        providerSessionId: options.providerSessionId,
        requestRunId: options.requestRunId,
        sdkRunId: analysisRun.id,
        stage: "emotion-drift" as const,
        startedAt: analysisStartedAt,
        status: collectedRun.status,
        statusHistory: collectedRun.statusHistory,
        toolCalls: collectedRun.toolCalls,
        usage: collectedRun.usage,
      },
    }
  } catch (err) {
    console.warn(`[EmotionDrift] Analysis failed entirely: ${err instanceof Error ? err.message : String(err)}`)
    return {
      summary: "感情分析スキップ",
      targetSins: { ...options.currentSins },
      telemetry: {
        browserSessionId: options.browserSessionId,
        durationMs: 0,
        error: err instanceof Error ? err.message : String(err),
        finishedAt: new Date().toISOString(),
        model: options.emotionModel,
        providerSessionId: options.providerSessionId,
        requestRunId: options.requestRunId,
        sdkRunId: "",
        stage: "emotion-drift" as const,
        startedAt: analysisStartedAt,
        status: "error",
        statusHistory: ["error"],
        toolCalls: [] as CursorToolCallTelemetry[],
        usage: null,
      },
    }
  } finally {
    if (typeof analysisAgent[Symbol.asyncDispose] === "function") {
      await analysisAgent[Symbol.asyncDispose]()
    } else {
      analysisAgent.close()
    }
  }
}

function buildHookEmotionPrompt(options: {
  artifacts: CharacterArtifactsPayload
  assistantText: string
  currentSins: Record<CharacterSinName, number>
}) {
  return [
    "あなたは hidden emotional drift analyst です。",
    "配信の1ターンが完了した直後に、内部キャラクター state の seven deadly sins をどう上下させるかだけを決めてください。",
    "",
    "【絶対ルール】",
    "- 応答は ```json コードブロックで囲んだ JSON のみ",
    "- JSON ブロックの前後に任何のテキスト・説明・markdown も付けない",
    "- 文字列内に { や } を含めないこと",
    "",
    `現在値は ${characterSinNames.join(", ")} の7軸で、それぞれ 0-100 の整数です。`,
    "出力スキーマ:",
    '```json\n{"summary": "", "targetSins": {"pride": 50, "greed": 50, "envy": 50, "wrath": 50, "sloth": 50, "lust": 50, "gluttony": 50}, "reasoning": [""]}\n```',
    "ルール:",
    "- 現在値を起点に、今回の返答と演出意図を見て次の目標値を決める。",
    "- 反応が弱い軸は据え置きでよい。毎回すべてを大きく動かさない。",
    "- lust は性的意味ではなく charm / mischievous allure / indulgent pampering として扱う。",
    "- wrath は境界線や鋭さの調整にだけ使い、攻撃性にはしない。",
    "- summary は1文、reasoning は最大3件の短文。",
    "",
    "現在の hidden state:",
    ...characterSinNames.map((name) => `- ${name}: ${options.currentSins[name]}`),
    "",
    "Character Director の補助データ:",
    JSON.stringify({
      deliveryStyle: options.artifacts.director.deliveryStyle,
      focusEmotion: options.artifacts.director.focusEmotion,
      sceneIntent: options.artifacts.director.sceneIntent,
      sevenDeadlySins: options.artifacts.director.sevenDeadlySins,
      source: options.artifacts.source,
    }),
    "",
    "今回の返答本文:",
    options.assistantText,
  ].join("\n")
}

function normalizeHookEmotionAnalysis(
  rawResponse: string,
  currentSins: Record<CharacterSinName, number>,
): {
  summary: string
  targetSins: Record<CharacterSinName, number>
} {
  const parsed = readRecord(JSON.parse(extractJsonObjectSafe(rawResponse, "Cursor emotion drift analysis output")))
  const rawTargets = readRecord(parsed?.targetSins)
  const targetSins = normalizeCharacterSinValues({
    envy: readNumericOrFallback(rawTargets?.envy, currentSins.envy),
    gluttony: readNumericOrFallback(rawTargets?.gluttony, currentSins.gluttony),
    greed: readNumericOrFallback(rawTargets?.greed, currentSins.greed),
    lust: readNumericOrFallback(rawTargets?.lust, currentSins.lust),
    pride: readNumericOrFallback(rawTargets?.pride, currentSins.pride),
    sloth: readNumericOrFallback(rawTargets?.sloth, currentSins.sloth),
    wrath: readNumericOrFallback(rawTargets?.wrath, currentSins.wrath),
  })

  return {
    summary: typeof parsed?.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : "感情の上下を再評価しました。",
    targetSins,
  }
}

function readNumericOrFallback(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null
}

async function writeHookManifest(runId: string, stateDir: string) {
  await mkdir(HOOK_MANIFEST_DIR, { recursive: true })
  const manifestPath = path.join(HOOK_MANIFEST_DIR, `${sanitizeHookKey(runId)}.json`)
  await writeFile(manifestPath, `${JSON.stringify({ runId, stateDir })}\n`, "utf8")
  return manifestPath
}

function isMissingFileError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

async function readHookErrorLog() {
  try {
    const raw = (await readFile(HOOK_ERROR_LOG_PATH, "utf8")).trim()

    if (!raw) {
      return null
    }

    const payload = JSON.parse(raw) as { message?: unknown }
    return typeof payload.message === "string" ? payload.message : "Unknown hook error."
  } catch (error) {
    if (isMissingFileError(error)) {
      return null
    }

    throw error
  }
}

async function hasStopHookMarker(stateDir: string) {
  try {
    await access(path.join(stateDir, STOP_HOOK_FILE_NAME))
    return true
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }

    throw error
  }
}

function wait(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs)
  })
}

function sanitizeHookKey(value: string) {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, "_")
  return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(sanitized) ? `_${sanitized}` : sanitized
}
