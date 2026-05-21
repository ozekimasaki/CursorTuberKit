import { chatAutomationReplyStyles, type ChatAutomationRequest } from "../../shared/automation.js"
import type { AutopilotTopicRequestBody } from "../../shared/autopilot.js"
import { characterSinNames, normalizeCharacterSinValues } from "../../shared/characterState.js"
import { isPlatformChatMode, type PlatformChatMode } from "../../shared/platformChat.js"
import type { PersonaAutoRewriteRequestBody, PersonaCuratorTurn } from "../../shared/personaCurator.js"
import type { ConversationTurn } from "../aiCommon.js"
import { isRecord } from "./errors.js"

export type ChatStreamRequestBody = {
  automation?: unknown
  inputKind?: unknown
  prompt?: unknown
  recentTurns?: unknown
}

export type VoicevoxSynthesisRequestBody = {
  text?: unknown
}

export type PlatformChatStartRequestBody = {
  mode?: unknown
  target?: unknown
}

export function parsePersonaAutoRewriteBody(raw: unknown): PersonaAutoRewriteRequestBody | null {
  if (!isRecord(raw)) return null

  const recentTurnsRaw = Array.isArray(raw.recentTurns) ? raw.recentTurns : []
  const recentTurns: PersonaCuratorTurn[] = []
  for (const item of recentTurnsRaw) {
    if (!isRecord(item)) continue
    const role = item.role
    const text = item.text
    if ((role !== "assistant" && role !== "user") || typeof text !== "string") continue
    recentTurns.push({ role, text: text.slice(0, 1200) })
    if (recentTurns.length >= 20) break
  }

  let runtimeSins: PersonaAutoRewriteRequestBody["runtimeSins"] | undefined
  if (isRecord(raw.runtimeSins)) {
    const sinsRaw = raw.runtimeSins
    runtimeSins = normalizeCharacterSinValues(
      Object.fromEntries(
        characterSinNames.map((name) => [
          name,
          typeof sinsRaw[name] === "number" && Number.isFinite(sinsRaw[name] as number)
            ? (sinsRaw[name] as number)
            : 50,
        ]),
      ),
    )
  }

  return { recentTurns, runtimeSins }
}

export function parseAutopilotTopicBody(raw: unknown): AutopilotTopicRequestBody | null {
  if (!isRecord(raw)) return null

  const baseSuggestionId = raw.baseSuggestionId
  if (
    baseSuggestionId !== "mini-corner" &&
    baseSuggestionId !== "opening" &&
    baseSuggestionId !== "recap" &&
    baseSuggestionId !== "teaser" &&
    baseSuggestionId !== "chapter-break"
  ) {
    return null
  }

  const basePrompt = typeof raw.basePrompt === "string" ? raw.basePrompt : ""
  const baseSummary = typeof raw.baseSummary === "string" ? raw.baseSummary : ""
  const baseTitle = typeof raw.baseTitle === "string" ? raw.baseTitle : ""
  if (!basePrompt || basePrompt.length > 2000) return null

  const recentAssistantTurns = parseStringArray(raw.recentAssistantTurns, 12, 600)
  const recentUserTurns = parseStringArray(raw.recentUserTurns, 12, 400)

  const sinsRaw = isRecord(raw.characterStateSins) ? raw.characterStateSins : null
  if (!sinsRaw) return null
  const sins = normalizeCharacterSinValues(
    Object.fromEntries(
      characterSinNames.map((name) => [
        name,
        typeof sinsRaw[name] === "number" && Number.isFinite(sinsRaw[name] as number)
          ? (sinsRaw[name] as number)
          : 50,
      ]),
    ),
  )

  let liveViewerEvent: AutopilotTopicRequestBody["liveViewerEvent"] = null
  if (isRecord(raw.liveViewerEvent)) {
    const authorName = raw.liveViewerEvent.authorName
    const text = raw.liveViewerEvent.text
    if (typeof authorName === "string" && typeof text === "string") {
      liveViewerEvent = {
        authorName: authorName.slice(0, 80),
        text: text.slice(0, 400),
      }
    }
  }

  const discoveryRaw = isRecord(raw.discovery) ? raw.discovery : null
  const discovery = discoveryRaw
    ? {
        time: typeof discoveryRaw.time === "boolean" ? discoveryRaw.time : undefined,
        wikipediaTea: typeof discoveryRaw.wikipediaTea === "boolean" ? discoveryRaw.wikipediaTea : undefined,
        mcp: typeof discoveryRaw.mcp === "boolean" ? discoveryRaw.mcp : undefined,
        season: typeof discoveryRaw.season === "boolean" ? discoveryRaw.season : undefined,
        topicRotation: typeof discoveryRaw.topicRotation === "boolean" ? discoveryRaw.topicRotation : undefined,
        selfHistory: typeof discoveryRaw.selfHistory === "boolean" ? discoveryRaw.selfHistory : undefined,
      }
    : undefined

  const openThreads = parseOpenThreads(raw.openThreads)
  const recentNoveltyScores = parseNoveltyScores(raw.recentNoveltyScores)
  const plannerHints = parsePlannerHints(raw.plannerHints)

  return {
    baseSuggestionId,
    basePrompt,
    baseSummary,
    baseTitle,
    characterStateSins: sins,
    liveViewerEvent,
    recentAssistantTurns,
    recentUserTurns,
    toneDirective: typeof raw.toneDirective === "string" ? raw.toneDirective : undefined,
    discovery,
    openThreads,
    recentNoveltyScores,
    plannerHints,
  }
}

export function parseOpenThreads(value: unknown): AutopilotTopicRequestBody["openThreads"] {
  if (!Array.isArray(value)) return undefined
  const result: NonNullable<AutopilotTopicRequestBody["openThreads"]> = []
  for (const entry of value.slice(0, 5)) {
    if (!isRecord(entry)) continue
    const tag = entry.tag
    const snippet = entry.snippet
    const lastSeenTurnIndex = entry.lastSeenTurnIndex
    if (typeof tag !== "string" || !tag.trim()) continue
    if (typeof snippet !== "string") continue
    if (typeof lastSeenTurnIndex !== "number" || !Number.isFinite(lastSeenTurnIndex)) continue
    result.push({
      tag: tag.trim().slice(0, 32),
      snippet: snippet.trim().slice(0, 120),
      lastSeenTurnIndex: Math.max(0, Math.floor(lastSeenTurnIndex)),
    })
  }
  return result.length > 0 ? result : undefined
}

export function parseNoveltyScores(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined
  const result: number[] = []
  for (const entry of value.slice(0, 8)) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) continue
    result.push(Math.max(0, Math.min(100, Math.round(entry))))
  }
  return result.length > 0 ? result : undefined
}

export function parsePlannerHints(value: unknown): AutopilotTopicRequestBody["plannerHints"] {
  if (!isRecord(value)) return undefined
  const hints: NonNullable<AutopilotTopicRequestBody["plannerHints"]> = {}
  if (typeof value.wantMoodShift === "boolean") hints.wantMoodShift = value.wantMoodShift
  if (typeof value.wantDeepCallback === "boolean") hints.wantDeepCallback = value.wantDeepCallback
  return Object.keys(hints).length > 0 ? hints : undefined
}

export function parseStringArray(value: unknown, maxCount: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  for (const entry of value.slice(0, maxCount)) {
    if (typeof entry === "string" && entry.trim()) {
      result.push(entry.trim().slice(0, maxLength))
    }
  }
  return result
}

export function parsePrompt(body: ChatStreamRequestBody) {
  if (typeof body.prompt !== "string") {
    return null
  }

  const prompt = body.prompt.trim()

  if (!prompt || prompt.length > 4000) {
    return null
  }

  return prompt
}

export function parseRecentTurns(body: ChatStreamRequestBody): ConversationTurn[] | null {
  if (body.recentTurns === undefined) {
    return []
  }

  if (!Array.isArray(body.recentTurns) || body.recentTurns.length > 12) {
    return null
  }

  const turns: ConversationTurn[] = []

  for (const entry of body.recentTurns) {
    if (!isRecord(entry)) {
      return null
    }

    if ((entry.role !== "user" && entry.role !== "assistant") || typeof entry.text !== "string") {
      return null
    }

    const text = entry.text.trim()

    if (!text || text.length > 1000) {
      return null
    }

    turns.push({ role: entry.role, text })
  }

  return turns
}

export function parseChatAutomationRequest(body: ChatStreamRequestBody): ChatAutomationRequest | null {
  if (body.automation === undefined) {
    return {
      source: "manual",
    }
  }

  if (!isRecord(body.automation)) {
    return null
  }

  if (body.automation.source !== "manual" && body.automation.source !== "platform_auto_reply") {
    return null
  }

  if (body.automation.target === undefined) {
    return {
      replyStyle: parseChatAutomationReplyStyle(body.automation.replyStyle),
      source: body.automation.source,
    }
  }

  if (!isRecord(body.automation.target)) {
    return null
  }

  const platform =
    body.automation.target.platform === undefined
      ? undefined
      : isPlatformChatMode(body.automation.target.platform)
        ? body.automation.target.platform
        : null
  const target =
    body.automation.target.target === undefined
      ? undefined
      : typeof body.automation.target.target === "string"
        ? body.automation.target.target.trim()
        : null

  if (platform === null || target === null) {
    return null
  }

  return {
    replyStyle: parseChatAutomationReplyStyle(body.automation.replyStyle),
    source: body.automation.source,
    target: {
      platform,
      target: target || undefined,
    },
  }
}

export function parseSpeechText(body: VoicevoxSynthesisRequestBody) {
  if (typeof body.text !== "string") {
    return null
  }

  const text = body.text.trim()

  if (!text || text.length > 1000) {
    return null
  }

  return text
}

export function parseChatAutomationReplyStyle(value: unknown): ChatAutomationRequest["replyStyle"] {
  return typeof value === "string" && chatAutomationReplyStyles.includes(value as (typeof chatAutomationReplyStyles)[number])
    ? (value as ChatAutomationRequest["replyStyle"])
    : undefined
}

export function parsePlatformChatConfig(body: PlatformChatStartRequestBody): { mode: PlatformChatMode; target: string } | null {
  if (!isPlatformChatMode(body.mode) || typeof body.target !== "string") {
    return null
  }

  const target = body.target.trim()
  if (!target || target.length > 400) {
    return null
  }

  return {
    mode: body.mode,
    target,
  }
}
