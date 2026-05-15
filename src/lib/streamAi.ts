import type { AutomationEnvelope, ChatAutomationRequest } from "../../shared/automation"
import { isCharacterArtifactsPayload, type CharacterArtifactsPayload } from "../../shared/characterAgents"
import { characterHookPhases, characterLustInterpretation, type CharacterStateMetadata } from "../../shared/characterState"
import {
  chatActionKinds,
  chatActionStatuses,
  chatStreamStates,
  isChatProvider,
  type ChatActionPayload,
  type ChatMetadataPayload,
  type ChatSessionPayload,
  type ChatStreamState,
} from "../../shared/chatStream"
import { emotionValues, type FinalEmotionPayload } from "../../shared/emotion"
import type { ModerationAssessment } from "../../shared/moderation"

type StreamState = "thinking" | "speaking" | "done"

const metadataEventKinds = ["status", "task", "tool", "action", "progress", "step", "metadata"] as const
type MetadataEventKind = (typeof metadataEventKinds)[number]

export type ConversationTurn = {
  role: "assistant" | "user"
  text: string
}

export type AiStreamEvent =
  | { type: "action"; payload: ChatActionPayload }
  | { type: "automation"; payload: AutomationEnvelope }
  | { type: "character-artifacts"; payload: CharacterArtifactsPayload }
  | { type: "emotion"; payload: FinalEmotionPayload }
  | { type: "metadata"; payload: ChatMetadataPayload }
  | { type: "meta"; meta: StreamMetadata }
  | { type: "moderation"; payload: ModerationAssessment }
  | { type: "session"; payload: ChatSessionPayload }
  | { type: "state"; state: StreamState }
  | { type: "text"; text: string }
  | { type: "error"; message: string }
  | { type: "done" }

export type StreamMetadata = {
  detail: string | null
  event: string
  kind: MetadataEventKind | "unknown"
  label: string
  name: string | null
  raw: unknown
  status: string | null
}

type RawSseEvent = {
  event: string
  data: unknown
}

type StreamAiRequest = {
  automation?: ChatAutomationRequest
  prompt: string
  recentTurns: ConversationTurn[]
  signal: AbortSignal
}

export async function* streamAiResponse({
  automation,
  prompt,
  recentTurns,
  signal,
}: StreamAiRequest): AsyncGenerator<AiStreamEvent> {
  const response = await fetch("/api/chat/stream", {
    body: JSON.stringify({ automation, prompt, recentTurns }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  })

  if (!response.ok) {
    const message = await readErrorMessage(response)
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error("ストリーミング応答の本文がありません。")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split("\n\n")
    buffer = frames.pop() ?? ""

    for (const frame of frames) {
      const parsed = parseSseFrame(frame)

      if (!parsed) {
        continue
      }

      const event = toAiStreamEvent(parsed)

      if (event) {
        yield event
      }
    }
  }

  buffer += decoder.decode()

  if (buffer.trim()) {
    const parsed = parseSseFrame(buffer)

    if (parsed) {
      const event = toAiStreamEvent(parsed)

      if (event) {
        yield event
      }
    }
  }
}

async function readErrorMessage(response: Response) {
  const contentType = response.headers.get("Content-Type") ?? ""

  if (contentType.includes("application/json")) {
    const body = (await response.json()) as unknown

    if (isRecord(body) && typeof body.error === "string") {
      return body.error
    }
  }

  const text = await response.text()
  return text || `サーバーエラーが発生しました。HTTP ${response.status}`
}

function parseSseFrame(frame: string): RawSseEvent | null {
  const lines = frame.split("\n")
  let eventName = "message"
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim()
      continue
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart())
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  return {
    event: eventName,
    data: parseSseData(dataLines.join("\n")),
  }
}

function parseSseData(rawData: string) {
  try {
    return JSON.parse(rawData) as unknown
  } catch {
    return rawData
  }
}

function toAiStreamEvent(raw: RawSseEvent): AiStreamEvent | null {
  if (raw.event === "action" && isChatActionPayload(raw.data)) {
    return { type: "action", payload: raw.data }
  }

  if (raw.event === "state" && isRecord(raw.data) && isStreamState(raw.data.state)) {
    return { type: "state", state: raw.data.state }
  }

  if (raw.event === "session" && isChatSessionPayload(raw.data)) {
    return { type: "session", payload: raw.data }
  }

  if (raw.event === "metadata" && isChatMetadataPayload(raw.data)) {
    return { type: "metadata", payload: raw.data }
  }

  if (raw.event === "character-artifacts" && isCharacterArtifactsPayload(raw.data)) {
    return { type: "character-artifacts", payload: raw.data }
  }

  if (raw.event === "text" && isRecord(raw.data) && typeof raw.data.text === "string") {
    return { type: "text", text: raw.data.text }
  }

  if (raw.event === "emotion" && isFinalEmotionPayload(raw.data)) {
    return { type: "emotion", payload: raw.data }
  }

  if (raw.event === "moderation" && isModerationAssessment(raw.data)) {
    return { type: "moderation", payload: raw.data }
  }

  if (raw.event === "automation" && isAutomationEnvelope(raw.data)) {
    return { type: "automation", payload: raw.data }
  }

  if (raw.event === "error" && isRecord(raw.data) && typeof raw.data.message === "string") {
    return { type: "error", message: raw.data.message }
  }

  if (raw.event === "done") {
    return { type: "done" }
  }

  const meta = toStreamMetadata(raw)

  if (meta) {
    return { type: "meta", meta }
  }

  return null
}

function isStreamState(value: unknown): value is StreamState {
  return typeof value === "string" && chatStreamStates.includes(value as ChatStreamState)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isFinalEmotionPayload(value: unknown): value is FinalEmotionPayload {
  return (
    isRecord(value) &&
    typeof value.source === "string" &&
    (value.source === "cursor-subagent" || value.source === "text-inference") &&
    typeof value.hookObserved === "boolean" &&
    typeof value.emotion === "string" &&
    emotionValues.includes(value.emotion as (typeof emotionValues)[number])
  )
}

function isChatActionPayload(value: unknown): value is ChatActionPayload {
  return (
    isRecord(value) &&
    typeof value.kind === "string" &&
    chatActionKinds.includes(value.kind as (typeof chatActionKinds)[number]) &&
    typeof value.status === "string" &&
    chatActionStatuses.includes(value.status as (typeof chatActionStatuses)[number]) &&
    isChatProvider(value.provider) &&
    (value.detail === undefined || value.detail === null || typeof value.detail === "string") &&
    (value.source === undefined || value.source === "cursor-subagent" || value.source === "text-inference")
  )
}

function isChatSessionPayload(value: unknown): value is ChatSessionPayload {
  return (
    isRecord(value) &&
    typeof value.browserSessionId === "string" &&
    value.browserSessionId.length > 0 &&
    (value.characterStateSignature === undefined || typeof value.characterStateSignature === "string") &&
    isChatProvider(value.provider) &&
    value.transport === "cookie" &&
    typeof value.supportsResume === "boolean" &&
    (value.providerSessionId === undefined || typeof value.providerSessionId === "string") &&
    (value.runId === undefined || typeof value.runId === "string") &&
    (value.reusedAgent === undefined || typeof value.reusedAgent === "boolean") &&
    (value.resumedAgent === undefined || typeof value.resumedAgent === "boolean") &&
    (value.continuedFromRunId === undefined || typeof value.continuedFromRunId === "string")
  )
}

function isChatMetadataPayload(value: unknown): value is ChatMetadataPayload {
  return (
    isRecord(value) &&
    isCharacterStateMetadata(value.characterState) &&
    isChatProvider(value.provider) &&
    typeof value.model === "string" &&
    (value.modelSource === "default" || value.modelSource === "env") &&
    typeof value.supportsProviderEmotion === "boolean" &&
    typeof value.supportsCharacterSubagents === "boolean" &&
    typeof value.supportsProviderSessionReuse === "boolean" &&
    (value.characterAgentModel === undefined || typeof value.characterAgentModel === "string") &&
    (value.characterAgentModelSource === undefined ||
      value.characterAgentModelSource === "default" ||
      value.characterAgentModelSource === "env") &&
    (value.emotionModel === undefined || typeof value.emotionModel === "string") &&
    (value.emotionModelSource === undefined ||
      value.emotionModelSource === "default" ||
      value.emotionModelSource === "env")
  )
}

function isCharacterStateMetadata(value: unknown): value is CharacterStateMetadata {
  return (
    isRecord(value) &&
    typeof value.signature === "string" &&
    value.schemaVersion === 1 &&
    value.hookVisibility === "internal-only" &&
    value.lustInterpretation === characterLustInterpretation &&
    Array.isArray(value.hookPhases) &&
    value.hookPhases.every(
      (phase) => typeof phase === "string" && characterHookPhases.includes(phase as (typeof characterHookPhases)[number]),
    )
  )
}

function isModerationAssessment(value: unknown): value is ModerationAssessment {
  return (
    isRecord(value) &&
    typeof value.disposition === "string" &&
    (value.disposition === "allow" || value.disposition === "review" || value.disposition === "block") &&
    Array.isArray(value.categories) &&
    Array.isArray(value.reasons) &&
    typeof value.source === "string"
  )
}

function isAutomationEnvelope(value: unknown): value is AutomationEnvelope {
  return (
    isRecord(value) &&
    Array.isArray(value.actions) &&
    isAutomationPolicy(value.policy) &&
    value.actions.every((action) => isAutomationAction(action))
  )
}

function isAutomationPolicy(value: unknown): value is AutomationEnvelope["policy"] {
  return (
    isRecord(value) &&
    typeof value.allowExternalExecution === "boolean" &&
    typeof value.allowInAppAutoExecution === "boolean" &&
    typeof value.maxExecutionLevel === "string"
  )
}

function isAutomationAction(value: unknown): value is AutomationEnvelope["actions"][number] {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.kind === "string" &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    typeof value.executionLevel === "string" &&
    typeof value.available === "boolean" &&
    typeof value.status === "string" &&
    typeof value.approvalState === "string" &&
    isRecord(value.target)
  )
}

function toStreamMetadata(raw: RawSseEvent): StreamMetadata | null {
  const record = isRecord(raw.data) ? raw.data : null
  const looksLikeMetadata =
    isMetadataEventKind(raw.event) ||
    typeof raw.data === "string" ||
    Boolean(
      record &&
        (
          readTextCandidate(record.label) ||
          readTextCandidate(record.title) ||
          readTextCandidate(record.summary) ||
          readTextCandidate(record.message) ||
          readTextCandidate(record.detail) ||
          readTextCandidate(record.description) ||
          readTextCandidate(record.task) ||
          readTextCandidate(record.tool) ||
          readTextCandidate(record.action) ||
          readTextCandidate(record.name) ||
          readTextCandidate(record.phase) ||
          readTextCandidate(record.status)
        ),
    )

  if (!looksLikeMetadata) {
    return null
  }

  const kind = inferMetadataKind(raw.event, record)
  const name =
    readTextCandidate(record?.name) ??
    readTextCandidate(record?.tool) ??
    readTextCandidate(record?.task) ??
    readTextCandidate(record?.action)
  const label =
    readTextCandidate(record?.label) ??
    readTextCandidate(record?.title) ??
    readTextCandidate(record?.summary) ??
    readTextCandidate(record?.task) ??
    readTextCandidate(record?.tool) ??
    readTextCandidate(record?.action) ??
    readTextCandidate(record?.message) ??
    readTextCandidate(record?.detail) ??
    readTextCandidate(record?.description) ??
    readTextCandidate(record?.phase) ??
    readTextCandidate(record?.status) ??
    (typeof raw.data === "string" ? normalizeText(raw.data) : null) ??
    defaultMetadataLabel(raw.event, name)
  const detail =
    readTextCandidate(record?.detail) ??
    readTextCandidate(record?.description) ??
    readTextCandidate(record?.message) ??
    readTextCandidate(record?.text) ??
    (typeof raw.data === "string" ? normalizeText(raw.data) : null)
  const status =
    readTextCandidate(record?.status) ?? readTextCandidate(record?.state) ?? readTextCandidate(record?.phase)

  return {
    detail: detail && detail !== label ? detail : null,
    event: raw.event,
    kind,
    label,
    name,
    raw: raw.data,
    status,
  }
}

function isMetadataEventKind(value: string): value is MetadataEventKind {
  return metadataEventKinds.includes(value as MetadataEventKind)
}

function inferMetadataKind(event: string, record: Record<string, unknown> | null): MetadataEventKind | "unknown" {
  if (isMetadataEventKind(event)) {
    return event
  }

  if (readTextCandidate(record?.tool)) {
    return "tool"
  }

  if (readTextCandidate(record?.task)) {
    return "task"
  }

  if (readTextCandidate(record?.action)) {
    return "action"
  }

  if (readTextCandidate(record?.status) || readTextCandidate(record?.phase)) {
    return "status"
  }

  return "unknown"
}

function readTextCandidate(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeText(value)
  }

  if (!isRecord(value)) {
    return null
  }

  return (
    readTextCandidate(value.label) ??
    readTextCandidate(value.title) ??
    readTextCandidate(value.summary) ??
    readTextCandidate(value.name) ??
    readTextCandidate(value.message) ??
    readTextCandidate(value.text)
  )
}

function normalizeText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized || null
}

function defaultMetadataLabel(event: string, name: string | null) {
  switch (event) {
    case "status":
      return "進行状況を更新中"
    case "task":
      return name ? `タスク: ${name}` : "タスクを処理中"
    case "tool":
      return name ? `ツール: ${name}` : "ツールを実行中"
    case "action":
      return name ? `アクション: ${name}` : "アクションを処理中"
    case "progress":
      return "進捗を更新中"
    case "step":
      return "処理ステップを更新中"
    case "metadata":
      return "メタデータを受信しました"
    default:
      return name ? `${event}: ${name}` : `${event} イベント`
  }
}
