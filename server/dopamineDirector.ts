import { Agent } from "@cursor/sdk"
import { collectCursorRun } from "./cursorSdkRun.js"
import { validateCursorConfiguration } from "./cursorAgent.js"
import type { DirectorDecision, MutationCue } from "../shared/dopamineMutation.js"

let directorAgent: Awaited<ReturnType<typeof Agent.create>> | null = null

async function getDirectorAgent() {
  if (directorAgent) return directorAgent
  validateCursorConfiguration()
  directorAgent = await Agent.create({
    apiKey: process.env.CURSOR_API_KEY!,
    model: { id: "composer-2.5", params: [{ id: "thinking", value: "low" }] },
    local: { cwd: process.cwd() },
    name: "dopamine-director",
  })
  return directorAgent
}

export async function decideMutation(
  commentText: string,
  currentEmotion: string,
  recentComments: string[],
): Promise<DirectorDecision> {
  const agent = await getDirectorAgent()

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

  const run = await agent.send(prompt)
  const result = await collectCursorRun(run)

  console.log(`[DopamineDirector] AI raw response (${result.status}): "${result.text.substring(0, 200)}..."`)

  const parsed = parseDirectorResponse(result.text)
  console.log(`[DopamineDirector] Decision: emotion=${parsed.emotionTag}, intensity=${parsed.intensity}, vm=${parsed.visualMultiplier}, glitch=[${parsed.glitchTypes.join(",")}]`)
  return parsed
}

function parseDirectorResponse(text: string): DirectorDecision {
  // Extract JSON from possible markdown code blocks
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/)
  const jsonStr = jsonMatch ? jsonMatch[1] ?? jsonMatch[0] : text

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
    console.error(`[DopamineDirector] JSON parse failed: ${err instanceof Error ? err.message : String(err)}. Raw: "${text.substring(0, 300)}"`)
    // Fallback to heuristic
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
