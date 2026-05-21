import { Agent, type ConversationStep, type Run } from "@cursor/sdk"
import {
  clampCharacterIntensity,
  createCharacterAgentUsage,
  type CharacterAgentKind,
  type CharacterArtifactsPayload,
  type ContentSegmentPlan,
  type SevenDeadlySinsProfile,
} from "../shared/characterAgents.js"
import { characterProfile } from "../shared/characterProfile.js"
import { emotionValues, inferEmotionFromText, type Emotion } from "../shared/emotion.js"
import { collectCursorRun } from "./cursorSdkRun.js"
import type { CursorRunTelemetryRecord } from "./cursorTypes.js"

const CHARACTER_DIRECTOR_NAME = "character-director"
const LORE_KEEPER_NAME = "lore-keeper"
const RELATIONSHIP_MANAGER_NAME = "relationship-manager"
const CONTENT_WRITER_NAME = "content-writer"

type CharacterArtifactsResult = {
  payload: CharacterArtifactsPayload
  telemetry: CursorRunTelemetryRecord | null
  usedFallback: boolean
}

type CharacterArtifactsOptions = {
  apiKey: string
  assistantText: string
  characterStateSignature: string
  conversationContext: string
  model: string
  session: {
    browserSessionId: string
    providerSessionId?: string
    requestRunId?: string
  }
  runState: {
    get: () => Run | null
    set: (run: Run | null) => Run | null
  }
}

export async function deriveCharacterArtifacts(options: CharacterArtifactsOptions): Promise<CharacterArtifactsResult> {
  const agentUsage = createCharacterAgentUsage()

  try {
    const analysisResult = await runCharacterArtifactAnalysis(options, agentUsage)
    return {
      payload: analysisResult.payload,
      telemetry: analysisResult.telemetry,
      usedFallback: false,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown character agent error."
    console.warn(`Character agent analysis failed, falling back to local heuristics: ${reason}`)
    return {
      payload: buildFallbackCharacterArtifacts({
        agentUsage,
        assistantText: options.assistantText,
        characterStateSignature: options.characterStateSignature,
        conversationContext: options.conversationContext,
        model: options.model,
        warning: reason,
      }),
      telemetry: null,
      usedFallback: true,
    }
  }
}

async function runCharacterArtifactAnalysis(
  options: CharacterArtifactsOptions,
  agentUsage: CharacterArtifactsPayload["agentUsage"],
) {
  const selectedModel = { id: options.model }
  const analysisAgent = await Agent.create({
    agents: {
      [CHARACTER_DIRECTOR_NAME]: {
        description: "返答の演出意図と seven deadly sins パラメータを設計する専門サブエージェント",
        model: selectedModel,
        prompt: [
          "あなたは Character Director です。",
          "返答の狙い、温度感、見せ方、視聴者エネルギー、seven deadly sins パラメータを決めてください。",
          "配信者ジョブの3段構造を意識する: ①掴み (耳を引く一言/口癖/感嘆) → ②展開 (観察・気持ち・軽い意見) → ③渡し (視聴者への投げかけ or 余白)。sceneIntent と deliveryStyle にはこの3段のうちどこに重心を置いたかが分かる表現を含めてください。",
          "seven deadly sins は pride / greed / wrath / envy / lust / gluttony / sloth の 7 軸で、各値は整数 0-100 にします。",
          "lust は性的に扱わず、魅力・小悪魔っぽさ・いたずらな甘やかし・ indulgent pampering の度合いとして安全に解釈してください。",
          `focusEmotion は ${emotionValues.join(", ")} のいずれか 1 つです。`,
          "deliveryStyle は2〜4個の短い副詞句で、声の質感 (例: 『軽やかに』『内緒話のように』『甘やかすように』) を表現してください。説明調や三人称解説のラベルにはしないこと。",
          "JSON 以外の出力をしないでください。",
        ].join("\n"),
      },
      [LORE_KEEPER_NAME]: {
        description: "世界観と継続性メモを抽出する専門サブエージェント",
        model: selectedModel,
        prompt: [
          "あなたは Lore Keeper です。",
          "返答文から世界観・継続性・今後参照したい要素を短く整理してください。",
          "canonFacts は今回の返答から読み取れる安定設定のみ、continuityNotes は次回以降の雰囲気維持に役立つメモ、memoryCandidates は保存価値の高い短文、openLoops は次回拾える未完了フックです。",
          "openLoops は『次回 planner が新しい角度で拾える形』にしてください (例: 『◯◯について視聴者の好みを聞きかけたまま』『△△の比喩を提示しただけで深掘り未了』)。単なる疑問符終わりの文をそのまま貼り付けるのは避けてください。",
          "memoryCandidates には、声が立った口癖・印象的な語り出し・温まった言い回しを最大1〜2個含めてよい (Persona Curator が次サイクルで参照する)。",
          "推測しすぎず、空配列を許可します。",
          "JSON 以外の出力をしないでください。",
        ].join("\n"),
      },
      [RELATIONSHIP_MANAGER_NAME]: {
        description: "視聴者との距離感と関係性の扱いを整理する専門サブエージェント",
        model: selectedModel,
        prompt: [
          "あなたは Relationship Manager です。",
          "返答に表れている距離感、信頼、からかい、安心感、境界線、次に使えるコールバックを整理してください。",
          "viewerRole は短いラベル、各レベル値は 0-100 の整数です。",
          "boundaries は守るべき言い回しや距離感、callbacks は次回の会話で自然に拾える短文です。",
          "callbacks は次ターンで『そのまま同じ角度で繰り返す』のではなく、別の角度から拾えるフック (例: 『紅茶の話を、淹れる動作の話で拾い直す』) として書いてください。直近で使った言い回しをそのまま貼らない。",
          "JSON 以外の出力をしないでください。",
        ].join("\n"),
      },
      [CONTENT_WRITER_NAME]: {
        description: "字幕・音声向けの短いセグメント計画を組む専門サブエージェント",
        model: selectedModel,
        prompt: [
          "あなたは Content Writer / Segment Planner です。",
          "完成済み返答を字幕・音声向けに順序どおり 1-6 個の短いセグメントへ分けてください。",
          `各セグメントには ${emotionValues.join(", ")} の emotion を 1 つ、intensity は 0-100、pauseMs は 0-1200 の整数、delivery は短い日本語で付けてください。`,
          "segments[].text は返答の語順を保ち、できるだけ原文に近い短文で切り出してください。",
          "opener と closer は『可能な限り埋める』ことを推奨します (掴みと渡しを字幕上でも明確にするため)。本当に該当する文が無い場合のみ null とし、summary でその理由を一言述べてください。",
          "JSON 以外の出力をしないでください。",
        ].join("\n"),
      },
    },
    apiKey: options.apiKey,
    model: selectedModel,
    name: `${characterProfile.agentName} Character Pipeline`,
  })

  const previousRun = options.runState.get()
  const analysisStartedAt = new Date().toISOString()

  try {
    const nextRun = options.runState.set(
      await analysisAgent.send(buildCharacterArtifactPrompt(options.conversationContext, options.assistantText), {
        model: selectedModel,
        onStep: ({ step }) => {
          markCharacterSubagentUsage(step, agentUsage)
        },
      }),
    )

    if (!nextRun) {
      throw new Error("Character analysis run could not be started.")
    }

    const collectedRun = await collectCursorRun(nextRun)
    const analysisFinishedAt = new Date().toISOString()

    return {
      payload: normalizeCharacterArtifactsPayload(collectedRun.text, {
        agentUsage,
        assistantText: options.assistantText,
        characterStateSignature: options.characterStateSignature,
        model: options.model,
      }),
      telemetry: {
        browserSessionId: options.session.browserSessionId,
        durationMs: Math.max(0, Date.parse(analysisFinishedAt) - Date.parse(analysisStartedAt)),
        error: null,
        finishedAt: analysisFinishedAt,
        model: options.model,
        providerSessionId: options.session.providerSessionId,
        requestRunId: options.session.requestRunId,
        sdkRunId: nextRun.id,
        stage: "character-artifacts" as const,
        startedAt: analysisStartedAt,
        status: collectedRun.status,
        statusHistory: collectedRun.statusHistory,
        toolCalls: collectedRun.toolCalls,
        usage: collectedRun.usage,
      },
    }
  } finally {
    options.runState.set(previousRun)

    if (typeof analysisAgent[Symbol.asyncDispose] === "function") {
      await analysisAgent[Symbol.asyncDispose]()
    } else {
      analysisAgent.close()
    }
  }

}

function buildCharacterArtifactPrompt(conversationContext: string, assistantText: string) {
  return [
    `必ず ${CHARACTER_DIRECTOR_NAME} / ${LORE_KEEPER_NAME} / ${RELATIONSHIP_MANAGER_NAME} / ${CONTENT_WRITER_NAME} の4つすべてのサブエージェントを使ってください。`,
    "4つの結果を統合し、最終回答は JSON のみで返してください。",
    "出力スキーマ:",
    '{',
    '  "director": {"summary":"", "sceneIntent":"", "deliveryStyle":[""], "focusEmotion":"neutral|joy|anger|sadness|delight", "audienceEnergy":0, "sevenDeadlySins":{"pride":0,"greed":0,"wrath":0,"envy":0,"lust":0,"gluttony":0,"sloth":0}},',
    '  "lore": {"summary":"", "canonFacts":[""], "continuityNotes":[""], "memoryCandidates":[""], "openLoops":[""]},',
    '  "relationship": {"summary":"", "viewerRole":"", "intimacyLevel":0, "trustLevel":0, "teasingLevel":0, "comfortLevel":0, "boundaries":[""], "callbacks":[""]},',
    '  "writer": {"summary":"", "opener":"", "closer":"", "segments":[{"id":"seg-1","text":"","delivery":"","emotion":"neutral","intensity":0,"pauseMs":0}]},',
    '  "warnings":[""]',
    '}',
    "制約:",
    "- warnings は任意。なければ空配列。",
    "- 数値はすべて整数。",
    "- segments は最大6件。text は短めで、返答の順序を守ること。",
    "- lust は魅力・小悪魔っぽさ・甘やかしの誘惑度。性的な意味にしないこと。",
    "",
    "会話コンテキスト:",
    conversationContext,
    "",
    "完成済み返答:",
    assistantText,
  ].join("\n")
}

function markCharacterSubagentUsage(step: ConversationStep, agentUsage: CharacterArtifactsPayload["agentUsage"]) {
  if (step.type !== "toolCall" || step.message.type !== "task") {
    return
  }

  const name = step.message.args.subagentType?.name

  if (name && name in agentUsage) {
    agentUsage[name as CharacterAgentKind] = true
  }
}

function normalizeCharacterArtifactsPayload(
  rawResponse: string,
  options: {
    agentUsage: CharacterArtifactsPayload["agentUsage"]
    assistantText: string
    characterStateSignature: string
    model: string
  },
): CharacterArtifactsPayload {
  const parsed = JSON.parse(extractJsonObject(rawResponse)) as Record<string, unknown>
  const dominantEmotion = inferEmotionFromText(options.assistantText)
  const segments = normalizeSegments(parsed.writer, options.assistantText, dominantEmotion)
  const warnings = normalizeStringArray(parsed.warnings, 4)
  const missingSubagents = Object.entries(options.agentUsage)
    .filter(([, used]) => !used)
    .map(([name]) => name)

  if (missingSubagents.length > 0) {
    warnings.push(`No explicit Cursor task step was observed for: ${missingSubagents.join(", ")}`)
  }

  return {
    agentUsage: createCharacterAgentUsage(options.agentUsage),
    characterStateSignature: options.characterStateSignature,
    director: {
      audienceEnergy: clampCharacterIntensity(readRecord(parsed.director)?.audienceEnergy ?? estimateAudienceEnergy(options.assistantText)),
      deliveryStyle: normalizeStringArray(readRecord(parsed.director)?.deliveryStyle, 4, ["やわらかく", "親しみやすく"]),
      focusEmotion: normalizeEmotion(readRecord(parsed.director)?.focusEmotion, dominantEmotion),
      sceneIntent: normalizeShortText(readRecord(parsed.director)?.sceneIntent, "viewer-response"),
      sevenDeadlySins: normalizeSevenDeadlySins(readRecord(parsed.director)?.sevenDeadlySins, options.assistantText),
      summary: normalizeShortText(readRecord(parsed.director)?.summary, "返答の見せ方を整理しました。"),
    },
    generatedAt: new Date().toISOString(),
    lore: {
      canonFacts: normalizeStringArray(readRecord(parsed.lore)?.canonFacts, 5),
      continuityNotes: normalizeStringArray(readRecord(parsed.lore)?.continuityNotes, 5),
      memoryCandidates: normalizeStringArray(readRecord(parsed.lore)?.memoryCandidates, 4),
      openLoops: normalizeStringArray(readRecord(parsed.lore)?.openLoops, 4),
      summary: normalizeShortText(readRecord(parsed.lore)?.summary, "継続性メモを抽出しました。"),
    },
    model: options.model,
    relationship: {
      boundaries: normalizeStringArray(readRecord(parsed.relationship)?.boundaries, 4),
      callbacks: normalizeStringArray(readRecord(parsed.relationship)?.callbacks, 4),
      comfortLevel: clampCharacterIntensity(readRecord(parsed.relationship)?.comfortLevel ?? 72),
      intimacyLevel: clampCharacterIntensity(readRecord(parsed.relationship)?.intimacyLevel ?? 58),
      summary: normalizeShortText(readRecord(parsed.relationship)?.summary, "視聴者との距離感を整理しました。"),
      teasingLevel: clampCharacterIntensity(readRecord(parsed.relationship)?.teasingLevel ?? estimateTeasingLevel(options.assistantText)),
      trustLevel: clampCharacterIntensity(readRecord(parsed.relationship)?.trustLevel ?? 75),
      viewerRole: normalizeShortText(readRecord(parsed.relationship)?.viewerRole, "配信を見守る視聴者"),
    },
    source: "cursor-subagents",
    warnings: warnings.slice(0, 4),
    writer: {
      closer: normalizeOptionalShortText(readRecord(parsed.writer)?.closer, segments.at(-1)?.text ?? null),
      opener: normalizeOptionalShortText(readRecord(parsed.writer)?.opener, segments[0]?.text ?? null),
      segments,
      summary: normalizeShortText(readRecord(parsed.writer)?.summary, "字幕・音声向けセグメントを整理しました。"),
    },
  }
}

function buildFallbackCharacterArtifacts(options: {
  agentUsage: CharacterArtifactsPayload["agentUsage"]
  assistantText: string
  characterStateSignature: string
  conversationContext: string
  model: string
  warning: string
}): CharacterArtifactsPayload {
  const dominantEmotion = inferEmotionFromText(options.assistantText)
  const segments = buildFallbackSegments(options.assistantText, dominantEmotion)

  return {
    agentUsage: createCharacterAgentUsage(options.agentUsage),
    characterStateSignature: options.characterStateSignature,
    director: {
      audienceEnergy: estimateAudienceEnergy(options.assistantText),
      deliveryStyle: estimateDeliveryStyle(options.assistantText),
      focusEmotion: dominantEmotion,
      sceneIntent: "viewer-response",
      sevenDeadlySins: normalizeSevenDeadlySins(null, options.assistantText),
      summary: "Cursor subagent analysis could not be completed, so heuristic direction was generated locally.",
    },
    generatedAt: new Date().toISOString(),
    lore: {
      canonFacts: [],
      continuityNotes: options.conversationContext ? [`会話コンテキスト: ${truncateText(options.conversationContext, 120)}`] : [],
      memoryCandidates: [],
      openLoops: extractOpenLoops(options.assistantText),
      summary: "Fallback continuity notes were generated locally.",
    },
    model: options.model,
    relationship: {
      boundaries: ["親しみやすさを保ちつつ、配信者として安心感のある距離感を維持する。"],
      callbacks: [],
      comfortLevel: 78,
      intimacyLevel: 56,
      summary: "Fallback viewer relationship cues were generated locally.",
      teasingLevel: estimateTeasingLevel(options.assistantText),
      trustLevel: 74,
      viewerRole: "配信を見守る視聴者",
    },
    source: "heuristic-fallback",
    warnings: [truncateText(options.warning, 220)],
    writer: {
      closer: segments.at(-1)?.text ?? null,
      opener: segments[0]?.text ?? null,
      segments,
      summary: "Fallback subtitle/audio segments were generated locally.",
    },
  }
}

function normalizeSegments(rawWriter: unknown, assistantText: string, dominantEmotion: Emotion) {
  const writer = readRecord(rawWriter)
  const rawSegments = Array.isArray(writer?.segments) ? writer.segments : []
  const normalized = rawSegments
    .map((segment, index) => normalizeSegment(segment, index, dominantEmotion))
    .filter((segment): segment is ContentSegmentPlan => segment !== null)
    .slice(0, 6)

  return normalized.length > 0 ? normalized : buildFallbackSegments(assistantText, dominantEmotion)
}

function normalizeSegment(rawSegment: unknown, index: number, dominantEmotion: Emotion): ContentSegmentPlan | null {
  const segment = readRecord(rawSegment)
  const text = normalizeShortText(segment?.text, "")

  if (!text) {
    return null
  }

  return {
    delivery: normalizeShortText(segment?.delivery, "自然に"),
    emotion: normalizeEmotion(segment?.emotion, dominantEmotion),
    id: normalizeShortText(segment?.id, `seg-${index + 1}`),
    intensity: clampCharacterIntensity(segment?.intensity ?? 58),
    pauseMs: clampPauseMs(segment?.pauseMs),
    text: truncateText(text, 220),
  }
}

function buildFallbackSegments(text: string, dominantEmotion: Emotion) {
  return splitSegments(text).slice(0, 6).map((segment, index) => ({
    delivery: dominantEmotion === "delight" ? "弾むように" : dominantEmotion === "sadness" ? "やさしく" : "自然に",
    emotion: dominantEmotion,
    id: `seg-${index + 1}`,
    intensity: estimateAudienceEnergy(segment),
    pauseMs: index === 0 ? 80 : 140,
    text: segment,
  }))
}

function normalizeSevenDeadlySins(rawValue: unknown, assistantText: string): SevenDeadlySinsProfile {
  const value = readRecord(rawValue)
  const defaults = estimateSinProfile(assistantText)

  return {
    pride: clampCharacterIntensity(value?.pride ?? defaults.pride),
    greed: clampCharacterIntensity(value?.greed ?? defaults.greed),
    wrath: clampCharacterIntensity(value?.wrath ?? defaults.wrath),
    envy: clampCharacterIntensity(value?.envy ?? defaults.envy),
    lust: clampCharacterIntensity(value?.lust ?? defaults.lust),
    gluttony: clampCharacterIntensity(value?.gluttony ?? defaults.gluttony),
    sloth: clampCharacterIntensity(value?.sloth ?? defaults.sloth),
  }
}

function estimateSinProfile(text: string): SevenDeadlySinsProfile {
  const normalized = text.toLowerCase()
  const exclamations = (normalized.match(/[!！]/g) ?? []).length
  const questionMarks = (normalized.match(/[?？]/g) ?? []).length
  const hearts = (normalized.match(/[♡♥❤]/g) ?? []).length
  const ellipsis = (normalized.match(/…|\.{2,}/g) ?? []).length
  const teasing = normalized.includes("ふふ") || normalized.includes("いたずら") || normalized.includes("内緒")

  return {
    envy: 22 + questionMarks * 4,
    gluttony: normalized.includes("もっと") || normalized.includes("たっぷり") ? 58 : 34,
    greed: normalized.includes("ずっと") || normalized.includes("何度でも") ? 54 : 30,
    lust: 36 + hearts * 10 + (teasing ? 14 : 0),
    pride: normalized.includes("任せて") ? 52 : 34,
    sloth: 18 + ellipsis * 6,
    wrath: 16 + exclamations * 8 + (normalized.includes("だめ") ? 20 : 0),
  }
}

function estimateAudienceEnergy(text: string) {
  const normalized = text.toLowerCase()
  const exclamations = (normalized.match(/[!！]/g) ?? []).length
  const hearts = (normalized.match(/[♡♥❤]/g) ?? []).length
  const laughter = (normalized.match(/w{2,}|笑/g) ?? []).length
  return clampCharacterIntensity(42 + exclamations * 10 + hearts * 8 + laughter * 6)
}

function estimateTeasingLevel(text: string) {
  const normalized = text.toLowerCase()
  return clampCharacterIntensity(
    28 +
      (normalized.includes("ふふ") ? 18 : 0) +
      (normalized.includes("いたずら") ? 20 : 0) +
      (normalized.includes("内緒") ? 12 : 0),
  )
}

function estimateDeliveryStyle(text: string) {
  const dominantEmotion = inferEmotionFromText(text)

  switch (dominantEmotion) {
    case "delight":
      return ["軽やかに", "弾むように"]
    case "joy":
      return ["やわらかく", "うれしそうに"]
    case "sadness":
      return ["しっとり", "やさしく"]
    case "anger":
      return ["きっぱり", "少し強めに"]
    default:
      return ["自然に", "親しみやすく"]
  }
}

function extractOpenLoops(text: string) {
  return splitSegments(text)
    .filter((segment) => /[?？]$/.test(segment))
    .slice(0, 3)
}

function splitSegments(text: string) {
  const normalized = text
    .split(/(?<=[。！？!?])/u)
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (normalized.length > 0) {
    return normalized
  }

  const fallback = text.trim()
  return fallback ? [truncateText(fallback, 220)] : ["…"]
}

function extractJsonObject(rawResponse: string) {
  const normalized = rawResponse.trim()

  if (!normalized) {
    throw new Error("Character agent response was empty.")
  }

  if (normalized.startsWith("{") && normalized.endsWith("}")) {
    return normalized
  }

  const match = normalized.match(/\{[\s\S]*\}/)

  if (!match) {
    throw new Error(`Character agent response did not contain JSON: ${truncateText(normalized, 200)}`)
  }

  return match[0]
}

function normalizeEmotion(value: unknown, fallback: Emotion): Emotion {
  return typeof value === "string" && emotionValues.includes(value as Emotion) ? (value as Emotion) : fallback
}

function normalizeStringArray(value: unknown, limit: number, fallback: string[] = []) {
  if (!Array.isArray(value)) {
    return fallback
  }

  const normalized = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .map((entry) => truncateText(entry, 180))
    .slice(0, limit)

  return normalized.length > 0 ? normalized : fallback
}

function normalizeShortText(value: unknown, fallback: string) {
  const normalized = typeof value === "string" ? value.trim() : ""
  return truncateText(normalized || fallback, 180)
}

function normalizeOptionalShortText(value: unknown, fallback: string | null) {
  if (value === null) {
    return null
  }

  const normalized = typeof value === "string" ? value.trim() : fallback
  return normalized ? truncateText(normalized, 180) : null
}

function clampPauseMs(value: unknown) {
  return Math.min(1200, Math.max(0, Math.round(typeof value === "number" ? value : Number(value) || 0)))
}

function readRecord(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim()

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`
}
