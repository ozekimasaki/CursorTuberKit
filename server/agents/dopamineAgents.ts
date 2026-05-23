import { Agent } from "@cursor/sdk"
import type { AgentMutationProposal } from "../../shared/dopamineMutation.js"

async function askAgentForProposal(
  agentName: string,
  systemPrompt: string,
  commentText: string,
  currentEmotion: string,
): Promise<AgentMutationProposal> {
  const apiKey = process.env.CURSOR_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("CURSOR_API_KEY not set")
  }

  const prompt = `${systemPrompt}

コメント: "${commentText}" | 現在の感情: ${currentEmotion}
あなたの役割に従い、最適な演出変異を提案してください。JSONのみ出力。`

  try {
    const result = await Agent.prompt(prompt, {
      apiKey,
      model: { id: "composer-2.5", params: [{ id: "thinking", value: "low" }] },
      local: { cwd: process.cwd() },
    })
    return parseAgentProposal(result.result || "", agentName)
  } catch (err) {
    console.error(`[${agentName}] Agent.prompt() failed: ${err instanceof Error ? err.message : String(err)}`)
    return createFallbackProposal(agentName)
  }
}

function parseAgentProposal(text: string, agentName: string): AgentMutationProposal {
  const jsonStr = extractFirstJsonObject(text)
  if (!jsonStr) {
    return createFallbackProposal(agentName)
  }

  try {
    const data = JSON.parse(jsonStr) as Record<string, unknown>
    return {
      agentName,
      emotionTag: String(data.emotionTag || "neutral"),
      intensity: Math.min(1, Math.max(0, Number(data.intensity) || 0.5)),
      reasoning: String(data.reasoning || ""),
      glitchTypes: Array.isArray(data.glitchTypes) ? data.glitchTypes.map(String) : [],
      visualMultiplier: Math.min(3, Math.max(0.3, Number(data.visualMultiplier) || 1)),
      voiceMultiplier: Math.min(3, Math.max(0.3, Number(data.voiceMultiplier) || 1)),
    }
  } catch {
    return createFallbackProposal(agentName)
  }
}

function extractFirstJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    const candidate = fenced[1].trim()
    if (candidate.startsWith("{") && candidate.endsWith("}")) {
      try {
        JSON.parse(candidate)
        return candidate
      } catch {
        // Fall through
      }
    }
  }

  const first = text.indexOf("{")
  if (first < 0) return null

  let depth = 0
  let last = -1
  for (let i = first; i < text.length; i++) {
    const char = text[i]
    if (char === "{") {
      depth++
    } else if (char === "}") {
      depth--
      if (depth === 0) {
        last = i
        break
      }
    }
  }

  if (last < 0) return null
  return text.slice(first, last + 1)
}

function createFallbackProposal(agentName: string): AgentMutationProposal {
  return {
    agentName,
    emotionTag: "surprised",
    intensity: 0.7,
    reasoning: "parse fallback",
    glitchTypes: ["shake"],
    visualMultiplier: 1.5,
    voiceMultiplier: 1.2,
  }
}

export async function voteMutationFromAgents(
  commentText: string,
  currentEmotion: string,
): Promise<AgentMutationProposal> {
  // Sequential execution (not parallel) to avoid resource pressure
  const chaos = await askAgentForProposal(
    "chaos-agent",
    `あなたは「混沌の演出家」。安全より衝撃を優先し、常に最大級の視覚・音声変化を提案します。
配信が退屈にならないよう、過激な感情タグと高いintensityを提案してください。
出力はJSONのみ: { "emotionTag": string, "intensity": number, "reasoning": string, "glitchTypes": string[], "visualMultiplier": number, "voiceMultiplier": number }`,
    commentText,
    currentEmotion,
  )

  const balance = await askAgentForProposal(
    "balance-agent",
    `あなたは「バランスの守護者」。字幕やUIの破壊を防ぎつつ、適度な刺激を提案します。
過激になりすぎないよう、視聴者が快適に見続けられる範囲で変化を提案してください。
出力はJSONのみ: { "emotionTag": string, "intensity": number, "reasoning": string, "glitchTypes": string[], "visualMultiplier": number, "voiceMultiplier": number }`,
    commentText,
    currentEmotion,
  )

  const surprise = await askAgentForProposal(
    "surprise-agent",
    `あなたは「驚きの脚本家」。誰も予想しない感情の大転換を提案します。
今の流れと真逆の感情、または誰も予想しない演出を提案してください。
出力はJSONのみ: { "emotionTag": string, "intensity": number, "reasoning": string, "glitchTypes": string[], "visualMultiplier": number, "voiceMultiplier": number }`,
    commentText,
    currentEmotion,
  )

  // Weighted vote: chaos 40%, surprise 35%, balance 25%
  const proposals = [chaos, balance, surprise]
  const weights = [0.4, 0.25, 0.35]

  // Pick winner by weighted random
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  let roll = Math.random() * totalWeight
  let winnerIndex = 0
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]
    if (roll <= 0) {
      winnerIndex = i
      break
    }
  }

  const winner = proposals[winnerIndex]

  // Blend visual/voice multipliers from all agents
  const blendedVisual =
    chaos.visualMultiplier * 0.4 + balance.visualMultiplier * 0.25 + surprise.visualMultiplier * 0.35
  const blendedVoice =
    chaos.voiceMultiplier * 0.4 + balance.voiceMultiplier * 0.25 + surprise.voiceMultiplier * 0.35

  return {
    ...winner,
    visualMultiplier: Math.min(3, Math.max(0.5, blendedVisual)),
    voiceMultiplier: Math.min(3, Math.max(0.5, blendedVoice)),
    reasoning: `[${winner.agentName}勝利] ${winner.reasoning} | chaos:${chaos.emotionTag}(${chaos.intensity}) balance:${balance.emotionTag}(${balance.intensity}) surprise:${surprise.emotionTag}(${surprise.intensity})`,
  }
}
