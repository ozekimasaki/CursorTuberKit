import { Agent } from "@cursor/sdk"
import { characterProfile } from "../shared/characterProfile.js"
import {
  maxCharacterFullPromptLength,
  maxCharacterPromptLength,
  type ChatSettings,
} from "../shared/chatSettings.js"
import type { CharacterSinValues } from "../shared/characterState.js"
import type { PersonaCuratorTurn } from "../shared/personaCurator.js"
import type { MemKraftPromptContext } from "./aiCommon.js"
import { collectCursorRun } from "./cursorSdkRun.js"
import { disposeAgentSafely, extractJsonObject, truncate, withTimeout } from "./cursorAgentUtils.js"

const PERSONA_CURATOR_NAME = "persona-curator"
const PERSONA_CRITIC_NAME = "persona-critic"
const CURATOR_TIMEOUT_MS = 12000

type RunPersonaCuratorOptions = {
  apiKey: string
  model: string
  currentSettings: ChatSettings
  recentTurns: PersonaCuratorTurn[]
  runtimeSins: CharacterSinValues
  memoryContext: MemKraftPromptContext
  signal?: AbortSignal
}

export type PersonaCuratorResult = {
  characterPrompt: string
  characterFullPrompt: string
  summary: string
}

export class PersonaCuratorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PersonaCuratorError"
  }
}

export async function runPersonaCurator(options: RunPersonaCuratorOptions): Promise<PersonaCuratorResult> {
  const selectedModel = { id: options.model }
  const agent = await Agent.create({
    agents: {
      [PERSONA_CURATOR_NAME]: {
        description: "配信を踏まえてキャラ人格プロンプトを自然進化させるキュレーター",
        model: selectedModel,
        prompt: [
          `あなたは ${characterProfile.name} の Persona Curator です。`,
          "現行の人格プロンプト (characterPrompt: 短い設定 / characterFullPrompt: 詳しい指示) を、",
          "直近の配信会話・キャラの内部状態 (sins)・長期記憶のコンテキストを踏まえて、",
          "本人らしさを保ったまま『より生きた表現』『会話で見えた癖の言語化』『最近よく出た話題への適応』『配信者としての魅力濃度』を反映して書き換えます。",
          "",
          "出力は JSON のみ。スキーマ:",
          '{"characterPrompt":"","characterFullPrompt":"","summary":""}',
          "",
          "▼ 厳守ルール",
          "- 既存の核 (名前・基本パーソナリティ・口調・一人称・二人称・基本世界観) を壊さない。大改造ではなく漸進進化。",
          `- characterPrompt は ${maxCharacterPromptLength} 文字以内。短く凝縮された設定書き。`,
          `- characterFullPrompt は ${maxCharacterFullPromptLength} 文字以内。具体的な振る舞い指示。`,
          "- characterFullPrompt 内に元から含まれる {{characterName}} プレースホルダーは保持する。",
          "- 視聴者コメントの量・有無・ROM専・コメント催促などのメタ表現は絶対に書き込まない。",
          "- AI/プロンプト/自走モード等のメタ表現も書き込まない。",
          "",
          "▼ 魅力濃度を上げる方向 (重要)",
          "- 直近の自分の発話で『実際に声が立っていた口癖・語り出し・印象的フレーズ』を 1〜2 個抽出し、characterPrompt の口癖欄に昇格させる (既存の口癖は基本残し、入れ替えは控えめに)。",
          "- 視聴者の反応が温まった言い回し・距離感があれば、声/話し方の記述に反映する (固有名詞でも可)。",
          "- characterPrompt にサンプル発話 (掴み→展開→渡しの3段構造の例) が既にある場合は形式を維持し、必要なら 1 つだけ差し替える。",
          "- 過剰謙遜・自己卑下を助長する表現は積極的に削る。代わりに『一歩前へ進める』『角度を変える』『観察を添える』方向の指示を残す。",
          "",
          "▼ 抑制ルール",
          "- 極端な特化はしない (例: 全話題を1つの趣味に寄せる等)。",
          "- summary は今回の更新で何を 1〜2 文で日本語要約 (例: 『紅茶の温度の話題が増えたので口癖に反映』『直近の語り出し《ふふ、月の角度がね》を口癖候補へ昇格』)。",
          "- JSON 以外を絶対に出力しない。",
        ].join("\n"),
      },
      [PERSONA_CRITIC_NAME]: {
        description: "改訂版プロンプトの破壊度・整合性・魅力濃度を判定するクリティック",
        model: selectedModel,
        prompt: [
          "あなたは Persona Critic です。",
          "改訂版 prompt を以下の観点で判定:",
          "(a) 核となる人格 (名前・基本口調・一人称・二人称・基本世界観) が破壊されていない",
          "(b) 文字数制限内",
          "(c) コメントメタ表現・AI/プロンプト等メタ表現を含まない",
          "(d) {{characterName}} プレースホルダーが元 characterFullPrompt にあった場合、改訂版にも残っている",
          "(e) 【重要】魅力濃度: 声 (口癖・語尾・一人称) の指示が薄まっていない／サンプル発話があれば形式が崩れていない／配信者ジョブ (掴み→展開→渡し) の方針が消えていない",
          "(f) 【重要】差別化要素: 元のキャラ固有の比喩・小道具・トーンが失われていない",
          "(g) 【重要】過剰謙遜・自己卑下を助長する文言が新たに増えていない",
          "出力は JSON のみ:",
          '{"accepted":true,"reason":"","regenerateInstruction":""}',
          "accepted=false の場合は regenerateInstruction に修正方針を1〜2文 (どの要素を戻す/削るかを具体的に)。",
        ].join("\n"),
      },
    },
    apiKey: options.apiKey,
    model: selectedModel,
    name: `${characterProfile.agentName} Persona Curator`,
  })

  try {
    const controllerPrompt = buildCuratorControllerPrompt(options)
    const run = await agent.send(controllerPrompt, { model: selectedModel })
    const collected = await withTimeout(
      collectCursorRun(run, { signal: options.signal }),
      CURATOR_TIMEOUT_MS,
      "Persona curator",
      () => run.cancel().catch(() => undefined),
      (message) => new PersonaCuratorError(message),
    )

    const parsed = parseCuratorOutput(collected.text)

    return enforceLimits(parsed, options.currentSettings)
  } finally {
    await disposeAgentSafely(agent)
  }
}

function buildCuratorControllerPrompt(options: RunPersonaCuratorOptions): string {
  const { currentSettings, recentTurns, runtimeSins, memoryContext } = options
  const containsNamePlaceholder = currentSettings.characterFullPrompt.includes("{{characterName}}")

  const recentAssistant = recentTurns
    .filter((t) => t.role === "assistant")
    .slice(-6)
    .map((t, i) => `${i + 1}. ${truncate(t.text, 200)}`)
    .join("\n") || "(なし)"
  const recentUser = recentTurns
    .filter((t) => t.role === "user")
    .slice(-6)
    .map((t, i) => `${i + 1}. ${truncate(t.text, 200)}`)
    .join("\n") || "(なし)"

  const sinsBlock = Object.entries(runtimeSins)
    .map(([k, v]) => `- ${k}: ${v}/100`)
    .join("\n")

  const memoryBlock = [
    memoryContext.runningSummary?.trim() ? `- 運用サマリ: ${truncate(memoryContext.runningSummary.trim(), 320)}` : "",
    ...memoryContext.continuityNotes.slice(0, 3).map((n) => `- 継続メモ: ${truncate(n, 220)}`),
  ]
    .filter(Boolean)
    .join("\n") || "(なし)"

  return [
    `必ず ${PERSONA_CURATOR_NAME} → ${PERSONA_CRITIC_NAME} の順で 2 つのサブエージェントを呼んでください。`,
    "1) persona-curator に改訂版プロンプトを作らせる。",
    "2) persona-critic に判定させる。accepted=false の場合のみ、その regenerateInstruction を反映して persona-curator を 1 度だけ再実行する。",
    "3) 最終回答は以下スキーマの JSON のみ:",
    '{"characterPrompt":"","characterFullPrompt":"","summary":""}',
    "",
    `キャラ名: ${currentSettings.characterName}`,
    containsNamePlaceholder
      ? "重要: 元の characterFullPrompt には {{characterName}} プレースホルダーが含まれているので、改訂版にも必ず残す。"
      : "備考: 元の characterFullPrompt に {{characterName}} プレースホルダーは無いので、新規に追加する必要は無い (任意)。",
    "",
    "現在の characterPrompt (短い設定):",
    currentSettings.characterPrompt || "(空)",
    "",
    "現在の characterFullPrompt (詳しい指示):",
    currentSettings.characterFullPrompt || "(空)",
    "",
    "直近の自分の発話 (新しい順):",
    recentAssistant,
    "",
    "直近の視聴者コメント (新しい順):",
    recentUser,
    "",
    "現在の内部状態 (sins, 0-100):",
    sinsBlock,
    "",
    "長期記憶コンテキスト:",
    memoryBlock,
    "",
    "重要: 既存の核を壊さず、観察された癖や話題を 1〜2 個自然に取り込む形で漸進進化させる。",
    "重要: 視聴者コメントの量へのメタ表現 / AI・プロンプト等のメタ表現は絶対に含めない。",
  ].join("\n")
}

function parseCuratorOutput(raw: string): PersonaCuratorResult {
  if (!raw.trim()) {
    throw new PersonaCuratorError("Persona curator returned empty response")
  }
  const json = extractJsonObject(raw, "Persona curator output", (message) => new PersonaCuratorError(message))
  const parsed = JSON.parse(json) as Record<string, unknown>

  const characterPrompt = typeof parsed.characterPrompt === "string" ? parsed.characterPrompt.trim() : ""
  const characterFullPrompt = typeof parsed.characterFullPrompt === "string" ? parsed.characterFullPrompt.trim() : ""
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : ""

  if (!characterPrompt || !characterFullPrompt) {
    throw new PersonaCuratorError("Persona curator output missing characterPrompt or characterFullPrompt")
  }

  return { characterPrompt, characterFullPrompt, summary: summary || "プロンプトを更新しました。" }
}

function enforceLimits(result: PersonaCuratorResult, current: ChatSettings): PersonaCuratorResult {
  const characterPrompt =
    result.characterPrompt.length <= maxCharacterPromptLength
      ? result.characterPrompt
      : result.characterPrompt.slice(0, maxCharacterPromptLength)
  let characterFullPrompt =
    result.characterFullPrompt.length <= maxCharacterFullPromptLength
      ? result.characterFullPrompt
      : result.characterFullPrompt.slice(0, maxCharacterFullPromptLength)

  if (current.characterFullPrompt.includes("{{characterName}}") && !characterFullPrompt.includes("{{characterName}}")) {
    characterFullPrompt = `${characterFullPrompt}\n\n名前: {{characterName}}`
    if (characterFullPrompt.length > maxCharacterFullPromptLength) {
      characterFullPrompt = characterFullPrompt.slice(0, maxCharacterFullPromptLength)
    }
  }

  return { characterPrompt, characterFullPrompt, summary: result.summary }
}
