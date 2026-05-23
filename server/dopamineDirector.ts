import { Agent } from "@cursor/sdk"
import type { DirectorDecision, MutationCue } from "../shared/dopamineMutation.js"
import { collectCursorRun } from "./cursorSdkRun.js"
import { createCursorLocalOptions } from "./cursorLocalOptions.js"
import { disposeAgentSafely, extractJsonObjectSafe, withTimeout } from "./cursorAgentUtils.js"

const DOPAMINE_DIRECTOR_TIMEOUT_MS = 12000

export async function decideMutation(
  commentText: string,
  currentEmotion: string,
  recentComments: string[],
): Promise<DirectorDecision> {
  const apiKey = process.env.CURSOR_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("CURSOR_API_KEY not set")
  }

  console.log(`[DopamineDirector] Analyzing comment: "${commentText.substring(0, 50)}" (current: ${currentEmotion})`)

  const context = recentComments.slice(-5).join("\n")
  const prompt = `あなたはVTuber配信の「ドーパミン演出ディレクター」AIです。
視聴者コメントから最適な感情タグと演出強度を即座に決定してください。

## 入力
- 現在の感情: ${currentEmotion}
- 直近コメント:
${context || "(なし)"}
- 新規コメント: "${commentText}"

## 出力形式（JSONのみ）
{
  "emotionTag": "angry|happy|sad|surprised|disgust|fear|love|neutral",
  "intensity": 0.0~1.0,
  "reasoning": "なぜこの判断か短文で",
  "glitchTypes": ["invert-flash", "scale-jump", "blur-pulse", "slice-shift", "chromatic-warp", "scanline-flicker", "matrix-rain", "frame-drop", "data-moshing", "shake", "hue-spin", "skew-warp", "rotate-spin", "saturate-flash", "ghost-trail" から0~5個],
  "visualMultiplier": 0.5~2.0,
  "voiceMultiplier": 0.5~2.0,
  "shouldMutant": true|false
}

ルール:
- 煽り・辛口コメント → angry, 高intensity
- 褒め・喜び → happy, 中〜高intensity
- 退屈そう → surprisedでサプライズ演出
- 常に配信者が「気づくレベル以上」の激しさを目指す
- visualMultiplierは基準値に掛ける倍率（1.5=50%増し）`

  let agent: Awaited<ReturnType<typeof Agent.create>> | null = null

  try {
    agent = await Agent.create({
      apiKey,
      model: { id: "composer-2.5", params: [{ id: "thinking", value: "low" }] },
      local: createCursorLocalOptions(),
      name: "Dopamine Director",
    })
    const run = await agent.send(prompt)
    const result = await withTimeout(
      collectCursorRun(run),
      DOPAMINE_DIRECTOR_TIMEOUT_MS,
      "Dopamine director",
      () => run.cancel().catch(() => undefined),
    )

    console.log(`[DopamineDirector] AI raw response (${result.status}): "${result.text.substring(0, 200)}..."`)

    const parsed = parseDirectorResponse(result.text)
    console.log(`[DopamineDirector] Decision: emotion=${parsed.emotionTag}, intensity=${parsed.intensity}, vm=${parsed.visualMultiplier}, glitch=[${parsed.glitchTypes.join(",")}]`)
    return parsed
  } catch (err) {
    console.error(`[DopamineDirector] AI director failed: ${err instanceof Error ? err.message : String(err)}`)
    // Return fallback
    return {
      emotionTag: currentEmotion || "neutral",
      intensity: 0.6,
      reasoning: "AI director failed, using current emotion",
      glitchTypes: ["shake", "invert-flash"],
      visualMultiplier: 1.2,
      voiceMultiplier: 1.0,
      shouldMutant: false,
    }
  } finally {
    if (agent) {
      await disposeAgentSafely(agent)
    }
  }
}

function parseDirectorResponse(text: string | undefined): DirectorDecision {
  if (!text) {
    return createFallback()
  }

  let jsonStr: string
  try {
    jsonStr = extractJsonObjectSafe(text, "Dopamine director output")
  } catch {
    console.error(`[DopamineDirector] No valid JSON found in response. Raw: "${text.substring(0, 300)}"`)
    return createFallback()
  }

  try {
    const data = JSON.parse(jsonStr) as Record<string, unknown>
    return {
      emotionTag: String(data.emotionTag || "neutral"),
      intensity: Math.min(1, Math.max(0, Number(data.intensity) || 0.5)),
      reasoning: String(data.reasoning || ""),
      glitchTypes: Array.isArray(data.glitchTypes) ? data.glitchTypes.map(String) : [],
      visualMultiplier: Math.min(3, Math.max(0.3, Number(data.visualMultiplier) || 1)),
      voiceMultiplier: Math.min(3, Math.max(0.3, Number(data.voiceMultiplier) || 1)),
      shouldMutant: Boolean(data.shouldMutant),
    }
  } catch (err) {
    console.error(`[DopamineDirector] JSON parse failed: ${err instanceof Error ? err.message : String(err)}. Extracted JSON: "${jsonStr.substring(0, 200)}"`)
    return createFallback()
  }
}

function createFallback(): DirectorDecision {
  return {
    emotionTag: "neutral",
    intensity: 0.5,
    reasoning: "AI parse failed, fallback",
    glitchTypes: ["shake", "invert-flash"],
    visualMultiplier: 1.2,
    voiceMultiplier: 1.0,
    shouldMutant: false,
  }
}

export function applyDirectorDecision(
  decision: DirectorDecision,
  commentText: string,
  receivedAt: string,
): MutationCue {
  return {
    kind: "ai_director",
    text: commentText,
    emotionTag: decision.emotionTag,
    intensity: decision.intensity,
    receivedAt,
  }
}
