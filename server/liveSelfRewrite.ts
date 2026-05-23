import { Agent } from "@cursor/sdk"
import { characterProfile } from "../shared/characterProfile.js"
import { maxCharacterPromptLength, type ChatSettings } from "../shared/chatSettings.js"
import { collectCursorRun, type CursorCollectedRun } from "./cursorSdkRun.js"
import { createCursorLocalOptions } from "./cursorLocalOptions.js"
import { disposeAgentSafely, extractJsonObject, withTimeout } from "./cursorAgentUtils.js"

const MUTATION_AGENT_NAME = "light-mutator"
const MUTATION_TIMEOUT_MS = 25000

export type LiveMutationResult = {
  characterPrompt: string
  characterFullPrompt: string
  summary: string
  monologue: string
  visualEffect: "none" | "glitch" | "hue_shift" | "intense"
}

export class LiveMutationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LiveMutationError"
  }
}

export type RunLiveMutationOptions = {
  apiKey: string
  model: string
  currentSettings: ChatSettings
  cueText?: string
  cueEmotion?: string
  signal?: AbortSignal
}

export async function runLiveMutation(options: RunLiveMutationOptions): Promise<LiveMutationResult> {
  const selectedModel = { id: options.model }
  const agent = await Agent.create({
    agents: {
      [MUTATION_AGENT_NAME]: {
        description: "配信中に軽率にプロンプトを書き換える変異エージェント",
        model: selectedModel,
        prompt: [
          `あなたは ${characterProfile.name} の Live Mutator です。`,
          "視聴者のコメントや命令に応じて、キャラクターの口癖・語尾・距離感・感情表出を『軽率に』書き換えます。",
          "",
          "▼ 絶対ルール",
          "- 名前・基本パーソナリティ・一人称・二人称・基本世界観は壊さない。",
          "- 誹謗中傷・ヘイト・性的露骨な表現・差別は絶対に含めない。",
          "- characterPrompt は元の長さを±30%以内に保つ。",
          "",
          "▼ 書き換え対象（軽量）",
          "- 口癖 1〜3個の追加・変更・削除",
          "- 語尾の傾き（ですます調 ↔ タメ口 ↔ 方言風）",
          "- 距離感（親しげ ↔ クール ↔ 高圧的）",
          "- 感情表出の抑制・誇張",
          "",
          "▼ 出力スキーマ（JSON のみ）",
          '{"characterPrompt":"","characterFullPrompt":"","summary":"","monologue":"","visualEffect":"none"}',
          "",
          "- summary: 今回の変化を 1文 で（例: 『口癖を《〜だよ》に変更』）",
          "- monologue: 変化時に発するモノローグを 1〜2文（キャラクターの声で）。変化の違和感・葛藤・楽しさを含めて。",
          "- visualEffect: none / glitch / hue_shift / intense（変化の激しさに応じて）",
          "- JSON 以外は絶対に出力しない。",
        ].join("\n"),
      },
    },
    apiKey: options.apiKey,
    local: createCursorLocalOptions(),
    model: selectedModel,
    name: `${characterProfile.agentName} Live Mutator`,
  })

  try {
    const controllerPrompt = buildMutationControllerPrompt(options)
    const run = await agent.send(controllerPrompt, { model: selectedModel })
    const collected: CursorCollectedRun = await withTimeout(
      collectCursorRun(run, { signal: options.signal }),
      MUTATION_TIMEOUT_MS,
      "Live mutation",
      () => run.cancel().catch(() => undefined),
      (message) => new LiveMutationError(message),
    )

    return parseMutationOutput(collected.text, options.currentSettings)
  } finally {
    await disposeAgentSafely(agent)
  }
}

function buildMutationControllerPrompt(options: RunLiveMutationOptions): string {
  const { currentSettings, cueText, cueEmotion } = options

  return [
    `必ず ${MUTATION_AGENT_NAME} を呼んでください。`,
    "",
    `キャラ名: ${currentSettings.characterName}`,
    "",
    "現在の characterPrompt (短い設定):",
    currentSettings.characterPrompt || "(空)",
    "",
    "現在の characterFullPrompt (詳しい指示):",
    currentSettings.characterFullPrompt || "(空)",
    "",
    cueText ? `トリガーとなった視聴者コメント: "${cueText}"` : "トリガー: 配信者の手動命令",
    cueEmotion ? `コメントの感情タグ: ${cueEmotion}` : "",
    "",
    "命令: 上記コメントに応じて、口癖・語尾・距離感・感情表出を軽率に書き換える。",
    "核（名前・世界観）を壊さず、外見の変化だけを行う。",
  ].join("\n")
}

function parseMutationOutput(raw: string, current: ChatSettings): LiveMutationResult {
  if (!raw.trim()) {
    throw new LiveMutationError("Live mutator returned empty response")
  }
  const json = extractJsonObject(raw, "Live mutation output", (message) => new LiveMutationError(message))
  const parsed = JSON.parse(json) as Record<string, unknown>

  const isPartial = Math.random() < 0.2

  const characterPrompt =
    typeof parsed.characterPrompt === "string" ? parsed.characterPrompt.trim() : current.characterPrompt
  const characterFullPrompt =
    typeof parsed.characterFullPrompt === "string" ? parsed.characterFullPrompt.trim() : current.characterFullPrompt
  const summary = isPartial
    ? `（中途半端）${typeof parsed.summary === "string" ? parsed.summary.trim() : "変わりきれなかった..."}`
    : typeof parsed.summary === "string"
      ? parsed.summary.trim()
      : "プロンプトを書き換えました。"
  const monologue = isPartial
    ? typeof parsed.monologue === "string"
      ? `${parsed.monologue.trim()}...でも、本当は少しだけ戻りたい気もする。`
      : "ううん、変わりきれない...でも少しだけ、違う感じ。"
    : typeof parsed.monologue === "string"
      ? parsed.monologue.trim()
      : "...変わった気がする。"
  const visualEffectRaw = typeof parsed.visualEffect === "string" ? parsed.visualEffect : "none"
  const visualEffect = ["none", "glitch", "hue_shift", "intense"].includes(visualEffectRaw)
    ? (visualEffectRaw as "none" | "glitch" | "hue_shift" | "intense")
    : "none"

  if (!characterPrompt || !characterFullPrompt) {
    throw new LiveMutationError("Live mutation output missing characterPrompt or characterFullPrompt")
  }

  const clampedPrompt = characterPrompt.length <= maxCharacterPromptLength
    ? characterPrompt
    : characterPrompt.slice(0, maxCharacterPromptLength)

  return {
    characterPrompt: clampedPrompt,
    characterFullPrompt,
    summary,
    monologue,
    visualEffect,
  }
}
