import { characterProfile } from "../shared/characterProfile.js"
import { createDefaultChatSettings, renderCharacterFullPrompt, type ChatMemoryMode, type ChatSettings } from "../shared/chatSettings.js"
import type { ChatAutomationReplyStyle } from "../shared/automation.js"
import type { ChatMetadataPayload, ChatStreamEvent } from "../shared/chatStream.js"
import type { CursorPromptMode } from "../shared/cursorPrompt.js"
import type { FinalEmotionPayload } from "../shared/emotion.js"
import type { CharacterRuntimeContext } from "./characterState.js"

export type ConversationTurn = {
  role: "assistant" | "user"
  text: string
}

export type StoredExchange = {
  assistant: string
  user: string
}

export type AvatarPromptBundle = {
  fullPrompt: string
  resumePrompt: string
}

export type MemKraftPromptContext = {
  continuityNotes: string[]
  injection: string
  recentExchanges: StoredExchange[]
  runningSummary: string
}

export type StreamAiResponseOptions = {
  compactPrompt?: string
  compiledPrompt: string
  onSupportingEvent?: (event: Extract<ChatStreamEvent, { type: "action" | "character-artifacts" | "session" }>) => void
  onEmotion?: (payload: FinalEmotionPayload) => void
  onText: (text: string) => void
  route: ChatMetadataPayload
  session: {
    browserSessionId: string
    transport: "cookie"
  }
  signal: AbortSignal
}

type BuildAvatarPromptOptions = {
  characterContext?: CharacterRuntimeContext
  chatSettings?: ChatSettings
  memoryContext?: MemKraftPromptContext
  recentTurns?: ConversationTurn[]
  replyStyle?: ChatAutomationReplyStyle
}

export function buildAvatarPrompt(userPrompt: string, options: BuildAvatarPromptOptions = {}) {
  return buildAvatarPromptBundle(userPrompt, options).fullPrompt
}

export function buildAvatarPromptBundle(userPrompt: string, options: BuildAvatarPromptOptions = {}): AvatarPromptBundle {
  return {
    fullPrompt: buildPromptSections(userPrompt, options, "full-context"),
    resumePrompt: buildPromptSections(userPrompt, options, "resume-compact"),
  }
}

function buildPromptSections(
  userPrompt: string,
  options: BuildAvatarPromptOptions,
  mode: CursorPromptMode,
) {
  const chatSettings = options.chatSettings ?? createDefaultChatSettings()
  const characterName = chatSettings.characterName
  const recentTurns = options.recentTurns?.slice(-6) ?? []
  const memoryContext = selectPromptMemoryContext(options.memoryContext, chatSettings.memory.mode)
  const sections =
    mode === "full-context"
      ? buildStablePromptSections(options.characterContext, chatSettings)
      : buildResumeLeadSections(chatSettings)

  if (mode === "full-context" && memoryContext?.injection) {
    sections.push("", "MemKraft から読み出した継続コンテキスト:", memoryContext.injection)
  }

  if (memoryContext?.runningSummary) {
    sections.push(
      "",
      mode === "full-context" ? "会話の流れの要約:" : "継続要約:",
      truncatePromptText(memoryContext.runningSummary, mode === "full-context" ? 240 : 180),
    )
  }

  if (memoryContext && memoryContext.continuityNotes.length > 0) {
    sections.push(
      "",
      mode === "full-context" ? "継続時に意識するメモ:" : "今回も維持したいポイント:",
      ...memoryContext.continuityNotes
        .slice(mode === "full-context" ? -4 : -3)
        .map((note) => `- ${truncatePromptText(note, mode === "full-context" ? 180 : 140)}`),
    )
  }

  if (mode === "full-context" && memoryContext && memoryContext.recentExchanges.length > 0) {
    sections.push(
      "",
      "キャラクター全体で共有している最近のやり取り:",
      ...memoryContext.recentExchanges.slice(-3).flatMap((exchange) => [
        `- 視聴者: ${truncatePromptText(exchange.user, 180)}`,
        `- ${characterName}: ${truncatePromptText(exchange.assistant, 220)}`,
      ]),
    )
  }

  if (mode === "full-context" && recentTurns.length > 0) {
    sections.push(
      "",
      "このブラウザでの直近の視聴者コメントと応答:",
      ...recentTurns.map((turn) => {
        const speaker = turn.role === "user" ? "視聴者" : characterName
        return `- ${speaker}: ${truncatePromptText(turn.text, 180)}`
      }),
    )
  }

  sections.push(
    "",
    mode === "full-context" ? "今回の視聴者コメント:" : "新しく届いた視聴者コメント:",
    userPrompt,
  )

  if (options.replyStyle === "short") {
    sections.push("", "いまはコメントが立て込んでいます。返答は1〜2文で短く、すぐ配信に返せる形にしてください。")
  }

  if (options.replyStyle === "compact") {
    sections.push(
      "",
      "いまは複数コメント候補から返す内容を選んでいます。いちばん拾う価値の高いコメントを主軸にし、必要なら近い話題だけ少し混ぜて1〜2文で返してください。",
    )
  }

  return sections.join("\n")
}

export function createEmptyMemKraftPromptContext(): MemKraftPromptContext {
  return {
    continuityNotes: [],
    injection: "",
    recentExchanges: [],
    runningSummary: "",
  }
}

function buildStablePromptSections(characterContext: CharacterRuntimeContext | undefined, chatSettings: ChatSettings) {
  const sections = [renderCharacterFullPrompt(chatSettings)]

  if (characterContext) {
    sections.push(
      "",
      characterContext.promptBlock,
      `キャラクター state signature: ${characterContext.metadata.signature}`,
    )
  }

  return sections
}

function buildResumeLeadSections(chatSettings: ChatSettings) {
  const renderedFullPrompt = renderCharacterFullPrompt(chatSettings)

  return [
    "継続中の同じ配信セッションです。これまでの会話文脈は保持されています。",
    "自己紹介や世界観の説明を繰り返さず、直前までの流れを踏まえて自然に続けてください。",
    "今回も維持したいキャラクター方針と話し方の優先ルール:",
    buildCompactCharacterPrompt(chatSettings.characterPrompt, renderedFullPrompt),
    "characterPrompt に書かれた口調、ですます調/常体、語尾、一人称、呼び方、NG 表現は短い返答でも崩さないでください。",
    "古い記憶よりも今回のコメントと直近の会話を優先してください。",
    "今回のコメントに対して、そのまま配信で話せる短く自然な返答を返してください。",
  ]
}

function buildCompactCharacterPrompt(characterPrompt: string, renderedFullPrompt: string) {
  const selected = dedupeLines([
    ...selectImportantLines(characterPrompt, {
      keywords: ["ですます", "常体", "語尾", "一人称", "二人称", "口調", "話し方", "呼び方", "NG", "禁止"],
      maxLines: 8,
      prefixes: ["役割", "性格", "雰囲気", "話し方", "口調", "文体", "一人称", "二人称", "語尾", "返答方針", "制約", "AI自認", "NG", "禁止"],
    }),
    ...selectImportantLines(renderedFullPrompt, {
      keywords: ["ですます", "常体", "語尾", "一人称", "二人称", "配信者本人", "別の名前", "台本", "字幕", "直前の流れ", "NG", "禁止"],
      maxLines: 8,
      prefixes: ["あなたの名前は", "入力は", "自分を指すときは", "あなたは配信者本人として", "視聴者コメントが", "返答は", "会話の連続性", "過去の記憶は"],
    }),
  ])

  return truncatePromptText(selected.join("\n"), 1200)
}

function selectImportantLines(
  value: string,
  options: {
    keywords: string[]
    maxLines: number
    prefixes: string[]
  },
) {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const selected: string[] = []

  for (const prefix of options.prefixes) {
    for (const line of lines) {
      if ((line.startsWith(`${prefix}:`) || line.startsWith(`${prefix}：`) || line.startsWith(prefix)) && !selected.includes(line)) {
        selected.push(line)
      }
    }
  }

  for (const keyword of options.keywords) {
    for (const line of lines) {
      if (line.includes(keyword) && !selected.includes(line)) {
        selected.push(line)
      }
    }
  }

  for (const line of lines) {
    if (selected.length >= options.maxLines) {
      break
    }

    if (!selected.includes(line)) {
      selected.push(line)
    }
  }

  return selected.slice(0, options.maxLines)
}

function dedupeLines(lines: string[]) {
  return lines.filter((line, index) => line && lines.indexOf(line) === index)
}

function selectPromptMemoryContext(
  memoryContext: MemKraftPromptContext | undefined,
  mode: ChatMemoryMode,
): MemKraftPromptContext {
  if (!memoryContext || mode === "off") {
    return createEmptyMemKraftPromptContext()
  }

  if (mode === "full") {
    return {
      continuityNotes: memoryContext.continuityNotes.slice(-4),
      injection: memoryContext.injection,
      recentExchanges: memoryContext.recentExchanges.slice(-3),
      runningSummary: memoryContext.runningSummary,
    }
  }

  return {
    continuityNotes: memoryContext.continuityNotes.slice(-2),
    injection: "",
    recentExchanges: memoryContext.recentExchanges.slice(-2),
    runningSummary: memoryContext.runningSummary,
  }
}

function truncatePromptText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim()

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`
}
