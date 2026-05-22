import { Agent } from "@cursor/sdk"
import type {
  AutopilotDiscoverySnippet,
  AutopilotOpenThread,
  AutopilotPlannerHints,
  AutopilotPlannerSource,
  AutopilotRetriedReason,
  AutopilotTopicRequestBody,
  AutopilotTopicResponse,
} from "../shared/autopilot.js"
import { computeDiscoveryEnableBias, computeNoveltyTarget, describeToneDirective } from "../shared/sinsBias.js"
import { characterProfile } from "../shared/characterProfile.js"
import type { MemKraftPromptContext } from "./aiCommon.js"
import { collectAutopilotDiscovery } from "./discovery/index.js"
import { collectCursorRun } from "./cursorSdkRun.js"
import { createCursorLocalOptions } from "./cursorLocalOptions.js"
import { disposeAgentSafely, extractJsonObject, truncate, withTimeout } from "./cursorAgentUtils.js"
import { applyLexicalPenalty, computeLexicalOverlapPenalty } from "./lib/lexicalOverlap.js"

const TOPIC_PLANNER_NAME = "topic-planner"
const NOVELTY_CRITIC_NAME = "novelty-critic"

const PLANNER_TIMEOUT_MS = 8000
const MAX_PROMPT_CHARS = 8000

type RunAutopilotPlannerOptions = {
  apiKey: string
  model: string
  body: AutopilotTopicRequestBody
  memoryContext?: MemKraftPromptContext
  signal?: AbortSignal
}

export class AutopilotPlannerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AutopilotPlannerError"
  }
}

export async function runAutopilotPlanner(
  options: RunAutopilotPlannerOptions,
): Promise<AutopilotTopicResponse> {
  const enableBias = computeDiscoveryEnableBias(options.body.characterStateSins)
  const discoveryRequest = options.body.discovery ?? {}

  const discovery = await collectAutopilotDiscovery({
    enableTime: discoveryRequest.time ?? true,
    enableWikipediaTea: discoveryRequest.wikipediaTea ?? enableBias["wikipedia-tea"],
    enableMcp: discoveryRequest.mcp ?? enableBias.mcp,
    enableSeason: discoveryRequest.season ?? enableBias.season,
    enableTopicRotation: discoveryRequest.topicRotation ?? enableBias["topic-rotation"],
    enableSelfHistory: discoveryRequest.selfHistory ?? enableBias["self-history"],
    topicHint: options.body.baseTitle ?? null,
    recentAssistantTurns: options.body.recentAssistantTurns,
  })

  const toneDirective = options.body.toneDirective ?? describeToneDirective(options.body.characterStateSins)
  const noveltyTarget = computeNoveltyTarget(options.body.characterStateSins)
  const memorySnippets = buildMemorySnippets(options.memoryContext)
  const allSnippets = [...discovery, ...memorySnippets]

  const selectedModel = { id: options.model }
  const agent = await Agent.create({
    agents: {
      [TOPIC_PLANNER_NAME]: {
        description: "コメントが少ない/無い時間帯の話題を自走的に作るプランナー",
        model: selectedModel,
        prompt: [
          `あなたは ${characterProfile.name} の専属 Topic Planner です。`,
          "目的: 直近の発話を踏まえつつ、配信者本人がそのまま口にできる『次の一手』を作る。視聴者コメントが少なくても自分の関心と観察で会話を前へ進める。",
          "出力は JSON のみ。スキーマ:",
          '{"title":"","summary":"","prompt":"","novelty":"","noveltyScore":0,"topicTags":[""],"usedSources":[""]}',
          "",
          "▼ prompt の書き方 (重要・刷新)",
          "- prompt は配信者本人が次ターンで話せる『導入文 + 視聴者への短い投げかけ』のハイブリッドにする (日本語 2〜4文、口語)。説明調・台本ト書き・三人称解説にはしない。",
          "- 1ターン構造: ①掴み(1秒で耳を引く一言/口癖/感嘆/小さな観察) → ②展開(自分の気持ち・観察・軽い意見を1〜2文) → ③渡し(視聴者へ短い問い、あるいは余白)。",
          "- 視聴者へ直接『あなた』『みんな』『ね』で語りかける。地の文で『〜について話す』とは書かない。",
          "",
          "▼ トピックモード (内容ではなく型で多様性を作る)",
          "- 次のいずれか1つのモードを必ず選び、topicTags の先頭要素に `mode:<モード名>` として埋め込む: observation(観察スケッチ) / question(視聴者への問いかけ) / memory(自分の小さな思い出・ストック) / imagination(もしも話・想像) / reaction(直近の自分の発話やopenThreadへの感情的反応) / explanation(短い豆知識・解説) / play(言葉遊び・小さなゲーム) / mood(雰囲気の切り替え・場の温度調整)。",
          "- 直近の自分の発話 (recentAssistant) から推測される直近モードと同じモードは避ける。連続するほど noveltyScore を下げる。",
          "",
          "▼ コールバックと話題選択",
          "- 【最優先】直近の自分の発話から1点以上を具体的に拾い、続き・発展・別角度で進める『コールバック』を必ず含める。",
          "- openThreads (未回収の話題) が渡されていて自然に拾える場合は積極的にコールバックする。拾うときは『前と同じ角度』ではなく必ず新しい角度 (味→淹れる人 / 物→記憶 / 説明→質問 / 風景→音) で持ち出す。",
          "- plannerHints.wantMoodShift=true: 直前を1点だけ受けてから topicMode を mood に切り替える。",
          "- plannerHints.wantDeepCallback=true: openThreads から最低1件は必ず拾う。",
          "- 直近返答と語り出し・主題語・口癖が同一にならない範囲で関連性は保つ。",
          "",
          "▼ 話題の素材",
          "- 紅茶/茶/季節は中心テーマの一部にすぎず、毎回そこへ収束させない。日常の小さな観察、視聴者への素直な質問、自分の感じたこと、想像、軽い遊びなど、モードを変えて多様に。",
          "",
          "▼ 禁止",
          "- 視聴者コメントの量・有無・ROM専・コメント催促などのメタ発言は絶対に含めない (例: 『コメント少ないけど』『コメント無いから一人で話すね』『ROM専さんも』『コメント待ってる』等)。",
          "- 『自走モード』『AIだから』『プロンプト』等メタ表現も入れない。",
          "- 『すみません』『ごめんなさい』『分かりません』だけで閉じる prompt。過剰な自己卑下や保留も禁止。",
          "",
          "▼ スコアリングと出典",
          "- noveltyScore は 0-100 の整数、被り少ないほど高い。目標 noveltyScore は controller から渡される noveltyTarget を上回ることを目指す。",
          "- usedSources は使ったスニペットの source 名 (time, wikipedia-tea, memkraft, mcp, season, topic-rotation, self-history, self)。self は自分の過去発話を参照した場合に必ず含める。",
          "- JSON 以外を絶対に出力しない。",
        ].join("\n"),
      },
      [NOVELTY_CRITIC_NAME]: {
        description: "プランの被り・コメント依存度・キャラ整合性・novelty 到達を採点するクリティック",
        model: selectedModel,
        prompt: [
          "あなたは Novelty Critic です。",
          "渡されたプランを以下の観点で判定する:",
          "(a) 直近返答と表現・主題語・語り出しが同一に被っていないか",
          "(b) 最後の視聴者コメントへ過度に依存していないか",
          "(c) キャラトーン (口調・語尾・口癖・上品さ・小悪魔っぽさ・甘やかし) と整合しているか",
          "(d) 【重要】直近の自分の発話への具体的なコールバックがあるか (無ければ却下)",
          "(e) 【重要】topicTags 先頭の `mode:<モード名>` が、直近の自分の発話 (recentAssistant) から推測される直近モードと連続していないか (連続なら却下し、別モードを指示)",
          "(f) 【重要】prompt が『配信者本人が口にできる導入文＋投げかけ』になっているか (説明調・台本ト書き・三人称解説なら却下)",
          "(g) 【重要】視聴者コメント量へのメタ発言 (『コメント少ない』『ROM』『コメント待ってる』等) や AI/プロンプト等のメタ表現、過剰謙遜 (『すみません』『分かりません』のみで閉じる) が含まれていないか (1つでも該当したら却下)",
          "(h) 【重要】noveltyScore が controller から渡された noveltyTarget を下回っていれば却下し、regenerateInstruction に『より新規性のある角度・別モードに切り替える』方針を書く",
          "(i) plannerHints.wantDeepCallback=true なのに openThreads から拾えていなければ却下",
          "出力は JSON のみ:",
          '{"accepted":true,"reason":"","regenerateInstruction":""}',
          "accepted=false の場合は regenerateInstruction に修正方針を1〜2文で記述する (どの自分の発話を拾うべきか、どの topicMode に切り替えるか、禁止表現の削除指示、novelty 不足解消の方向性などを含める)。",
        ].join("\n"),
      },
    },
    apiKey: options.apiKey,
    local: createCursorLocalOptions(),
    model: selectedModel,
    name: `${characterProfile.agentName} Autopilot Planner`,
  })

  try {
    const plannerPrompt = buildPlannerControllerPrompt({
      body: options.body,
      snippets: allSnippets,
      toneDirective,
      noveltyTarget,
    })

    const run = await agent.send(plannerPrompt, { model: selectedModel })
    const collected = await withTimeout(
      collectCursorRun(run, { signal: options.signal }),
      PLANNER_TIMEOUT_MS,
      "Planner",
      () => run.cancel().catch(() => undefined),
      (message) => new AutopilotPlannerError(message),
    )

    const parsed = parsePlannerOutput(collected.text)
    const lexicalPenalty = computeLexicalOverlapPenalty(parsed.summary, options.body.recentAssistantTurns)
    const adjustedScore = applyLexicalPenalty(parsed.noveltyScore, lexicalPenalty)

    let retriedReason: AutopilotRetriedReason | null = null
    let finalParsed = parsed
    let finalScore = adjustedScore

    if (!parsed.critic.accepted) {
      // Controller's internal regen handled it (and surfaces parsed.critic.regenerated).
      // Report as `critic` retried reason for observability.
      retriedReason = "critic"
    } else if (adjustedScore < noveltyTarget && !parsed.critic.regenerated) {
      // Score-based retry only when controller didn't already regen.
      retriedReason = "novelty"
      try {
        const retryPrompt = buildPlannerControllerPrompt({
          body: options.body,
          snippets: allSnippets,
          toneDirective,
          noveltyTarget,
          regenerateNoteOverride:
            `前回のプラン (noveltyScore=${adjustedScore}) は目標 ${noveltyTarget} に届かなかった。より新規性の高い角度・切り口で作り直すこと。前回 summary: ${truncate(parsed.summary, 160)}`,
        })
        const retryRun = await agent.send(retryPrompt, { model: selectedModel })
        const retryCollected = await withTimeout(
          collectCursorRun(retryRun, { signal: options.signal }),
          PLANNER_TIMEOUT_MS,
          "Planner",
          () => retryRun.cancel().catch(() => undefined),
          (message) => new AutopilotPlannerError(message),
        )
        const retryParsed = parsePlannerOutput(retryCollected.text)
        const retryLexical = computeLexicalOverlapPenalty(retryParsed.summary, options.body.recentAssistantTurns)
        const retryAdjusted = applyLexicalPenalty(retryParsed.noveltyScore, retryLexical)
        finalParsed = retryParsed
        finalScore = retryAdjusted
      } catch (retryError) {
        // Keep original result on retry failure.
        console.warn(
          `autopilot novelty regen failed: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
        )
      }
    }

    return {
      prompt: finalParsed.prompt,
      summary: finalParsed.summary,
      title: finalParsed.title,
      novelty: finalParsed.novelty,
      noveltyScore: finalScore,
      topicTags: finalParsed.topicTags,
      sources: finalParsed.usedSources,
      toneDirective,
      noveltyTarget,
      retriedReason,
      critic: finalParsed.critic,
    }
  } finally {
    await disposeAgentSafely(agent)
  }
}

function buildPlannerControllerPrompt(input: {
  body: AutopilotTopicRequestBody
  snippets: AutopilotDiscoverySnippet[]
  toneDirective: string
  noveltyTarget: number
  regenerateNoteOverride?: string
}): string {
  const { body, snippets, toneDirective, noveltyTarget, regenerateNoteOverride } = input

  const recentAssistant = body.recentAssistantTurns.slice(-4).map((t, i) => `${i + 1}. ${truncate(t, 120)}`).join("\n") || "(なし)"
  const recentUser = body.recentUserTurns.slice(-4).map((t, i) => `${i + 1}. ${truncate(t, 80)}`).join("\n") || "(なし)"

  const snippetBlock = snippets.length
    ? snippets.map((s, i) => `${i + 1}. [${s.source}] ${s.title}: ${s.detail}`).join("\n")
    : "(なし)"

  const viewerBlock = body.liveViewerEvent
    ? `${body.liveViewerEvent.authorName}: ${truncate(body.liveViewerEvent.text, 120)}`
    : "(直近コメント無し)"

  const openThreadsBlock = renderOpenThreads(body.openThreads)
  const hintsBlock = renderHints(body.plannerHints)
  const noveltyHistoryBlock = body.recentNoveltyScores?.length
    ? `直近noveltyScore履歴: ${body.recentNoveltyScores.join(", ")}`
    : ""

  const sections: string[] = [
    `必ず ${TOPIC_PLANNER_NAME} → ${NOVELTY_CRITIC_NAME} の順で 2 つのサブエージェントを呼んでください。`,
    "1) topic-planner にプランを作らせる。",
    "2) novelty-critic に判定させる。accepted=false の場合のみ、その regenerateInstruction を反映して topic-planner を 1 度だけ再実行する。",
    "3) 最終回答は以下スキーマの JSON だけにする (planner 結果 + critic 結果):",
    '{"plan":{"title":"","summary":"","prompt":"","novelty":"","noveltyScore":0,"topicTags":[""],"usedSources":[""]},"critic":{"accepted":true,"reason":"","regenerated":false}}',
    "",
    `基底サジェスト: id=${body.baseSuggestionId} / title=${body.baseTitle} / summary=${body.baseSummary}`,
    `元プロンプト(参考、必要なら拡張): ${truncate(body.basePrompt, 320)}`,
    `トーンディレクティブ: ${toneDirective}`,
    `noveltyTarget: ${noveltyTarget} (このスコアを超えることを目指す)`,
  ]

  if (noveltyHistoryBlock) sections.push(noveltyHistoryBlock)
  if (hintsBlock) sections.push("", "plannerHints:", hintsBlock)
  if (openThreadsBlock) sections.push("", "openThreads (未回収の話題, 拾えれば加点):", openThreadsBlock)

  sections.push(
    "",
    "直近の自分の返答:",
    recentAssistant,
    "",
    "直近の視聴者コメント:",
    recentUser,
    "",
    "最後の視聴者コメント:",
    viewerBlock,
    "",
    "Discovery スニペット (任意で1〜2件を活用):",
    snippetBlock,
    "",
    "重要: コメントが無くても、直近の自分の発話を発展させる形で話を広げる。",
    "重要: prompt は配信者本人が次ターンで口にできる『導入文＋投げかけ』のハイブリッドにする (説明調や台本ト書きにはしない)。",
    "重要: topicTags の先頭要素に `mode:<モード名>` を必ず入れ、直近の自分の発話と同じモードが連続しないようにする。",
    "重要(再掲): 視聴者コメント量へのメタ発言 (例: 『コメント少ないね』『ROM専の人も』『コメント待ってる』『コメント無いから』) は絶対に禁止。AI/プロンプト/自走モード等のメタ表現も禁止。",
    "重要(再掲): 過剰な謝罪・自己卑下 (『すみません』『分かりません』だけで閉じる) も禁止。",
    "重要(再掲): 上記『直近の自分の返答』から最低1点を具体的に引用または言及してコールバックを必ず作る (角度は変える)。",
  )

  if (regenerateNoteOverride) {
    sections.push("", `再生成指示 (novelty 不足のため強制再ロール): ${regenerateNoteOverride}`)
  }

  return enforcePromptBudget(sections.join("\n"), MAX_PROMPT_CHARS)
}

function renderOpenThreads(threads: AutopilotOpenThread[] | undefined): string {
  if (!threads || threads.length === 0) return ""
  return threads
    .map((thread, index) => `${index + 1}. ${thread.tag} — 「${truncate(thread.snippet, 80)}」`)
    .join("\n")
}

function renderHints(hints: AutopilotPlannerHints | undefined): string {
  if (!hints) return ""
  const parts: string[] = []
  if (hints.wantMoodShift) parts.push("- wantMoodShift: 直前の話題を1点受けてから雰囲気を切り替えて。")
  if (hints.wantDeepCallback) parts.push("- wantDeepCallback: openThreads から最低1件を必ず拾って深掘りする。")
  return parts.join("\n")
}

function enforcePromptBudget(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

function buildMemorySnippets(memory?: MemKraftPromptContext): AutopilotDiscoverySnippet[] {
  if (!memory) {
    return []
  }

  const snippets: AutopilotDiscoverySnippet[] = []

  if (memory.runningSummary?.trim()) {
    snippets.push({
      source: "memkraft",
      title: "運用サマリ",
      detail: truncate(memory.runningSummary.trim(), 220),
    })
  }

  for (const note of memory.continuityNotes.slice(0, 2)) {
    const trimmed = note.trim()
    if (trimmed) {
      snippets.push({
        source: "memkraft",
        title: "継続メモ",
        detail: truncate(trimmed, 200),
      })
    }
  }

  return snippets
}

type ParsedPlannerOutput = {
  title: string
  summary: string
  prompt: string
  novelty: string
  noveltyScore: number
  topicTags: string[]
  usedSources: AutopilotPlannerSource[]
  critic: { accepted: boolean; reason: string; regenerated: boolean }
}

function parsePlannerOutput(raw: string): ParsedPlannerOutput {
  if (!raw.trim()) {
    throw new AutopilotPlannerError("Planner returned empty response")
  }

  const json = extractJsonObject(raw, "Planner output", (message) => new AutopilotPlannerError(message))
  const parsed = JSON.parse(json) as Record<string, unknown>
  const planRaw = parsed.plan
  if (!planRaw || typeof planRaw !== "object") {
    throw new AutopilotPlannerError("Planner response missing 'plan'")
  }
  const plan = planRaw as Record<string, unknown>

  const prompt = typeof plan.prompt === "string" ? plan.prompt.trim() : ""
  if (!prompt) {
    throw new AutopilotPlannerError("Planner produced empty prompt")
  }

  const criticRaw = (parsed.critic && typeof parsed.critic === "object" ? parsed.critic : {}) as Record<string, unknown>

  return {
    title: typeof plan.title === "string" && plan.title.trim() ? plan.title.trim() : "自走トーク",
    summary:
      typeof plan.summary === "string" && plan.summary.trim() ? plan.summary.trim() : "自走的に話題を進めます。",
    prompt,
    novelty: typeof plan.novelty === "string" ? plan.novelty.trim() : "",
    noveltyScore:
      typeof plan.noveltyScore === "number" && Number.isFinite(plan.noveltyScore)
        ? Math.max(0, Math.min(100, Math.round(plan.noveltyScore)))
        : 50,
    topicTags: Array.isArray(plan.topicTags)
      ? plan.topicTags.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 6)
      : [],
    usedSources: Array.isArray(plan.usedSources)
      ? (plan.usedSources.filter((s): s is AutopilotPlannerSource => isPlannerSource(s)) as AutopilotPlannerSource[])
      : [],
    critic: {
      accepted: typeof criticRaw.accepted === "boolean" ? criticRaw.accepted : true,
      reason: typeof criticRaw.reason === "string" ? criticRaw.reason.trim() : "",
      regenerated: typeof criticRaw.regenerated === "boolean" ? criticRaw.regenerated : false,
    },
  }
}

function isPlannerSource(value: unknown): value is AutopilotPlannerSource {
  return (
    value === "memkraft" ||
    value === "time" ||
    value === "wikipedia-tea" ||
    value === "mcp" ||
    value === "viewer" ||
    value === "self" ||
    value === "season" ||
    value === "topic-rotation" ||
    value === "self-history"
  )
}
