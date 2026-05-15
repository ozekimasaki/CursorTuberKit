import { randomUUID } from "node:crypto"
import { access, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { Agent, type ConversationStep, type Run, type SDKAgent } from "@cursor/sdk"
import type { ChatActionPayload, ChatMetadataPayload, ChatSessionPayload } from "../shared/chatStream.js"
import type { CharacterArtifactsPayload } from "../shared/characterAgents.js"
import { characterProfile } from "../shared/characterProfile.js"
import { emotionValues, inferEmotionFromText, type Emotion, type FinalEmotionPayload } from "../shared/emotion.js"
import { deriveCharacterArtifacts } from "./characterAgents.js"
import {
  readCursorChatSessionRecord,
  writeCursorChatSessionRecord,
  type CursorChatSessionRecord,
} from "./cursorSessionStore.js"

type CursorWorkerInput = {
  compiledPrompt: string
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
    conversation_id?: string
    generation_id?: string
    hook_event_name?: string
  }
  receivedAt?: string
}

const EMOTION_SUBAGENT_NAME = "emotion-classifier"
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
      local: { cwd: process.cwd() },
      model: selectedModel,
      name: characterProfile.agentName,
    }))

  run = await startCursorRun(agent, input.compiledPrompt, selectedModel)
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
      resumedAgent: Boolean(resumed),
      reusedAgent,
      runId: run.id,
      supportsResume: true,
      transport: input.session.transport,
    },
  })

  let fullResponseText = ""

  for await (const event of run.stream()) {
    if (event.type !== "assistant") {
      continue
    }

    for (const block of event.message.content) {
      if (block.type === "text" && block.text) {
        fullResponseText += block.text
        writeOutput({ type: "text", text: block.text })
      }
    }
  }

  const runResult = await run.wait()
  sessionRecord = buildSessionRecord(
    sessionRecord,
    agent.agentId,
    input.session.browserSessionId,
    input.route.characterState.signature,
    model,
    run.id,
    runResult.status,
  )
  await writeCursorChatSessionRecord(sessionRecord)
  const normalizedResponse = fullResponseText.trim()

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
    conversationContext: input.compiledPrompt,
    model: characterAgentModel,
    runState: {
      get: () => run,
      set: restoreActiveRun,
    },
  })

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
    finalEmotion = await deriveFinalEmotion(normalizedResponse, Boolean(stopHookPayload))
    writeAction({
      detail: finalEmotion.hookObserved ? "Cursor stop hook observed." : "Cursor stop hook not observed before finalization.",
      kind: "emotion-finalize",
      provider: "cursor",
      source: finalEmotion.source,
      status: "completed",
    })
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

async function resumeExistingAgent(
  record: CursorChatSessionRecord | null,
  expectedCharacterStateSignature: string,
  selectedModel: { id: string },
) {
  if (!record?.agentId || record.characterStateSignature !== expectedCharacterStateSignature) {
    return null
  }

  try {
    return await Agent.resume(record.agentId, {
      apiKey,
      local: { cwd: process.cwd() },
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

function buildSessionRecord(
  existing: CursorChatSessionRecord | null,
  agentId: string,
  browserSessionId: string,
  characterStateSignature: string,
  sessionModel: string,
  runId: string,
  lastRunStatus: CursorChatSessionRecord["lastRunStatus"],
): CursorChatSessionRecord {
  const timestamp = new Date().toISOString()

  return {
    agentId,
    browserSessionId,
    characterStateSignature,
    createdAt: existing?.createdAt ?? timestamp,
    lastRunId: runId,
    lastRunStatus,
    model: sessionModel,
    updatedAt: timestamp,
  }
}

function resolveHookStateDir(browserSessionId: string) {
  return path.join(HOOK_RUNTIME_DIR, `${sanitizeHookKey(browserSessionId)}-${process.pid}-${randomUUID()}`)
}

async function deriveFinalEmotion(assistantText: string, hookObserved: boolean): Promise<FinalEmotionPayload> {
  try {
    return await runEmotionAnalysis(assistantText, hookObserved, emotionModel)
  } catch (error) {
    if (emotionModel === model) {
      throw error
    }

    console.warn(
      `Cursor emotion analysis with ${emotionModel} failed, retrying with ${model}: ${
        error instanceof Error ? error.message : "Unknown error."
      }`,
    )
    return runEmotionAnalysis(assistantText, hookObserved, model)
  }
}

async function runEmotionAnalysis(
  assistantText: string,
  hookObserved: boolean,
  analysisModel: string,
): Promise<FinalEmotionPayload> {
  const selectedModel = { id: analysisModel }
  const emotionAgent = await Agent.create({
    agents: {
      [EMOTION_SUBAGENT_NAME]: {
        description: "Catlin の完成済み返答から最終アバター感情を 1 つに分類する専門サブエージェント",
        model: selectedModel,
        prompt: [
          "あなたは Catlin のアバター感情を確定する専門サブエージェントです。",
          `許可される感情は ${emotionValues.join(", ")} のみです。`,
          "入力された完成済みの日本語返答全体を読み、アバターの最終感情を1つだけ決めてください。",
          '返答は JSON のみで、形式は {"emotion":"neutral|joy|anger|sadness|delight","confidence":0.0,"reason":"短い日本語"} にしてください。',
          "Markdown や追加説明は付けないでください。",
        ].join("\n"),
      },
    },
    apiKey,
    local: { cwd: process.cwd() },
    model: selectedModel,
    name: `${characterProfile.agentName} Emotion Analyzer`,
  })

  let usedEmotionSubagent = false
  let rawEmotionResponse = ""
  const previousRun = run

  try {
    run = setActiveRun(
      await emotionAgent.send(buildEmotionAnalysisPrompt(assistantText), {
        model: selectedModel,
        onStep: ({ step }) => {
          if (isEmotionSubagentStep(step)) {
            usedEmotionSubagent = true
          }
        },
      }),
    )

    for await (const event of run.stream()) {
      if (event.type !== "assistant") {
        continue
      }

      for (const block of event.message.content) {
        if (block.type === "text" && block.text) {
          rawEmotionResponse += block.text
        }
      }
    }

    await run.wait()
  } finally {
    run = previousRun

    if (typeof emotionAgent[Symbol.asyncDispose] === "function") {
      await emotionAgent[Symbol.asyncDispose]()
    } else {
      emotionAgent.close()
    }
  }

  if (!usedEmotionSubagent) {
    console.warn(`Cursor emotion analysis completed without an observed subagent task step (${analysisModel}).`)
  }

  const parsed = parseEmotionResponse(rawEmotionResponse)
  return {
    emotion: parsed.emotion,
    hookObserved,
    source: "cursor-subagent",
  }
}

function buildEmotionAnalysisPrompt(assistantText: string) {
  return [
    `必ず ${EMOTION_SUBAGENT_NAME} サブエージェントを使ってください。`,
    "完成済み返答の最終感情パラメータを 1 つだけ確定してください。",
    `利用可能な感情は ${emotionValues.join(", ")} のみです。`,
    '最終回答は JSON のみで {"emotion":"...","confidence":0.0,"reason":"短い日本語"} にしてください。',
    "",
    "対象返答:",
    assistantText,
  ].join("\n")
}

function isEmotionSubagentStep(step: ConversationStep) {
  return (
    step.type === "toolCall" &&
    step.message.type === "task" &&
    step.message.args.subagentType?.name === EMOTION_SUBAGENT_NAME
  )
}

function parseEmotionResponse(rawResponse: string) {
  const normalized = rawResponse.trim()

  if (!normalized) {
    throw new Error("Cursor emotion subagent returned an empty response.")
  }

  const jsonCandidate = extractJsonObject(normalized)
  const parsed = JSON.parse(jsonCandidate) as { emotion?: unknown }

  if (!isEmotion(parsed.emotion)) {
    throw new Error(`Cursor emotion subagent returned an invalid emotion: ${jsonCandidate}`)
  }

  return {
    emotion: parsed.emotion,
  }
}

function extractJsonObject(rawResponse: string) {
  if (rawResponse.startsWith("{") && rawResponse.endsWith("}")) {
    return rawResponse
  }

  const match = rawResponse.match(/\{[\s\S]*?\}/)

  if (!match) {
    throw new Error(`Cursor emotion subagent did not return JSON: ${rawResponse}`)
  }

  return match[0]
}

function isEmotion(value: unknown): value is Emotion {
  return typeof value === "string" && emotionValues.includes(value as Emotion)
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
  return value.replace(/[^a-zA-Z0-9._-]/g, "_")
}
