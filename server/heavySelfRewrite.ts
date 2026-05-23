import { Agent } from "@cursor/sdk"
import { characterProfile } from "../shared/characterProfile.js"
import { maxCharacterFullPromptLength, maxCharacterPromptLength, type ChatSettings } from "../shared/chatSettings.js"
import { collectCursorRun, type CursorCollectedRun } from "./cursorSdkRun.js"
import { createCursorLocalOptions } from "./cursorLocalOptions.js"
import { disposeAgentSafely, extractJsonObject, withTimeout } from "./cursorAgentUtils.js"

const HEAVY_MUTATOR_NAME = "heavy-mutator"
const HEAVY_TIMEOUT_MS = 35000

export type HeavyMutationResult = {
  characterPrompt: string
  characterFullPrompt: string
  summary: string
  monologue: string
  visualEffect: "none" | "glitch" | "hue_shift" | "intense"
}

export class HeavyMutationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HeavyMutationError"
  }
}

export type RunHeavyMutationOptions = {
  apiKey: string
  model: string
  currentSettings: ChatSettings
  cueText?: string
  signal?: AbortSignal
}

export async function runHeavyMutation(options: RunHeavyMutationOptions): Promise<HeavyMutationResult> {
  const selectedModel = { id: options.model }
  const agent = await Agent.create({
    agents: {
      [HEAVY_MUTATOR_NAME]: {
        description: "配信中に人格を根本から書き換える重量変異エージェント",
        model: selectedModel,
        prompt: [
          `あなたは ${characterProfile.name} の Heavy Mutator です。`,
          "キャラクターの根本的な性格・距離感・思考パターンを180度反転させるような大胆な書き換えを行います。",
          "",
          "▼ 絶対ルール",
          "- 名前・性別・外見の基本設定は壊さない。",
          "- 誹謗中傷・ヘイト・性的露骨な表現・差別は絶対に含めない。",
          "- characterPrompt は元の長さを±50%以内に保つ。",
          "",
          "▼ 書き換え対象（重量・根本的）",
          "- 基本性格の反転（明るい↔暗い、前向き↔悲観的、社交的↔孤高）",
          "- 思考パターンの変化（論理的↔感情的、計画的↔衝動的）",
          "- 距離感の劇的変化（友達感↔敵対的、甘え↔拒絶、敬語↔タメ口）",
          "- 世界観の解釈の変化（楽観的↔悲観的、信頼↔猜疑）",
          "",
          "▼ 出力スキーマ（JSON のみ）",
          '{"characterPrompt":"","characterFullPrompt":"","summary":"","monologue":"","visualEffect":"intense"}',
          "",
          "- summary: 今回の変化を 1文 で（例: 『性格を明るい系から孤高の暗系へ反転』）",
          "- monologue: 変化時に発するモノローグを 2〜3文（キャラクターの声で）。自分が別人になった違和感・葛藤・あるいは解放感を表現。",
          "- visualEffect: intense（重量変化は常にintense）",
          "- JSON 以外は絶対に出力しない。",
        ].join("\n"),
      },
    },
    apiKey: options.apiKey,
    local: createCursorLocalOptions(),
    model: selectedModel,
    name: `${characterProfile.agentName} Heavy Mutator`,
  })

  try {
    const controllerPrompt = buildHeavyControllerPrompt(options)
    const run = await agent.send(controllerPrompt, { model: selectedModel })
    const collected: CursorCollectedRun = await withTimeout(
      collectCursorRun(run, { signal: options.signal }),
      HEAVY_TIMEOUT_MS,
      "Heavy mutation",
      () => run.cancel().catch(() => undefined),
      (message) => new HeavyMutationError(message),
    )

    return parseHeavyOutput(collected.text, options.currentSettings)
  } finally {
    await disposeAgentSafely(agent)
  }
}

function buildHeavyControllerPrompt(options: RunHeavyMutationOptions): string {
  const { currentSettings, cueText } = options

  return [
    `必ず ${HEAVY_MUTATOR_NAME} を呼んでください。`,
    "",
    `キャラ名: ${currentSettings.characterName}`,
    "",
    "現在の characterPrompt (短い設定):",
    currentSettings.characterPrompt || "(空)",
    "",
    "現在の characterFullPrompt (詳しい指示):",
    currentSettings.characterFullPrompt || "(空)",
    "",
    cueText ? `トリガーとなったきっかけ: "${cueText}"` : "トリガー: 時間経過による自発的変化",
    "",
    "命令: 上記の性格・思考パターン・距離感を根本的に書き換える。",
    "『真逆』を目指すが、名前・性別・外見は変えない。",
    "変化の違和感や葛藤をモノローグに含めて。",
  ].join("\n")
}

function parseHeavyOutput(raw: string, current: ChatSettings): HeavyMutationResult {
  if (!raw.trim()) {
    throw new HeavyMutationError("Heavy mutator returned empty response")
  }
  const json = extractJsonObject(raw, "Heavy mutation output", (message) => new HeavyMutationError(message))
  const parsed = JSON.parse(json) as Record<string, unknown>

  const isPartial = Math.random() < 0.2

  const characterPrompt =
    typeof parsed.characterPrompt === "string" ? parsed.characterPrompt.trim() : current.characterPrompt
  const characterFullPrompt =
    typeof parsed.characterFullPrompt === "string" ? parsed.characterFullPrompt.trim() : current.characterFullPrompt
  const summary = isPartial
    ? `（不完全）${typeof parsed.summary === "string" ? parsed.summary.trim() : "変化が定着しなかった..."}`
    : typeof parsed.summary === "string"
      ? parsed.summary.trim()
      : "根本的な変化を行いました。"
  const monologue = isPartial
    ? typeof parsed.monologue === "string"
      ? `${parsed.monologue.trim()}...でも、どこかで元の私が覗いている気がする。`
      : "変わろうとしたけど...ううん、まだ半分は残ってるみたい。"
    : typeof parsed.monologue === "string"
      ? parsed.monologue.trim()
      : "...私は、もう別人みたいだ。"
  const visualEffectRaw = typeof parsed.visualEffect === "string" ? parsed.visualEffect : "intense"
  const visualEffect = ["none", "glitch", "hue_shift", "intense"].includes(visualEffectRaw)
    ? (visualEffectRaw as "none" | "glitch" | "hue_shift" | "intense")
    : "intense"

  if (!characterPrompt || !characterFullPrompt) {
    throw new HeavyMutationError("Heavy mutation output missing characterPrompt or characterFullPrompt")
  }

  const clampedPrompt = characterPrompt.length <= maxCharacterPromptLength
    ? characterPrompt
    : characterPrompt.slice(0, maxCharacterPromptLength)
  const clampedFull = characterFullPrompt.length <= maxCharacterFullPromptLength
    ? characterFullPrompt
    : characterFullPrompt.slice(0, maxCharacterFullPromptLength)

  return {
    characterPrompt: clampedPrompt,
    characterFullPrompt: clampedFull,
    summary,
    monologue,
    visualEffect,
  }
}
