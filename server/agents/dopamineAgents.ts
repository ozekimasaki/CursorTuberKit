import { Agent } from "@cursor/sdk"
import { collectCursorRun } from "../cursorSdkRun.js"
import { validateCursorConfiguration } from "../cursorAgent.js"
import type { AgentMutationProposal } from "../../shared/dopamineMutation.js"

let chaosAgent: Awaited<ReturnType<typeof Agent.create>> | null = null
let balanceAgent: Awaited<ReturnType<typeof Agent.create>> | null = null
let surpriseAgent: Awaited<ReturnType<typeof Agent.create>> | null = null

async function getChaosAgent() {
  if (chaosAgent) return chaosAgent
  validateCursorConfiguration()
  chaosAgent = await Agent.create({
    apiKey: process.env.CURSOR_API_KEY!,
    model: { id: "composer-2.5", params: [{ id: "thinking", value: "low" }] },
    local: { cwd: process.cwd() },
    name: "chaos-agent",
    agents: {
      "chaos-voter": {
        description: "常に激しい変化を求める攻撃的演出家",
        prompt: `あなたは「混沌の演出家」。安全より衝撃を優先し、常に最大級の視覚・音声変化を提案します。
配信が退屈にならないよう、過激な感情タグと高いintensityを提案してください。
出力はJSONのみ: { "emotionTag": string, "intensity": number, "reasoning": string, "glitchTypes": string[], "visualMultiplier": number, "voiceMultiplier": number }`,
        model: "inherit",
      },
    },
  })
  return chaosAgent
}

async function getBalanceAgent() {
  if (balanceAgent) return balanceAgent
  validateCursorConfiguration()
  balanceAgent = await Agent.create({
    apiKey: process.env.CURSOR_API_KEY!,
    model: { id: "composer-2.5", params: [{ id: "thinking", value: "low" }] },
    local: { cwd: process.cwd() },
    name: "balance-agent",
    agents: {
      "balance-voter": {
        description: "視認性と演出のバランスを取る保守派",
        prompt: `あなたは「バランスの守護者」。字幕やUIの破壊を防ぎつつ、適度な刺激を提案します。
過激になりすぎないよう、視聴者が快適に見続けられる範囲で変化を提案してください。
出力はJSONのみ: { "emotionTag": string, "intensity": number, "reasoning": string, "glitchTypes": string[], "visualMultiplier": number, "voiceMultiplier": number }`,
        model: "inherit",
      },
    },
  })
  return balanceAgent
}

async function getSurpriseAgent() {
  if (surpriseAgent) return surpriseAgent
  validateCursorConfiguration()
  surpriseAgent = await Agent.create({
    apiKey: process.env.CURSOR_API_KEY!,
    model: { id: "composer-2.5", params: [{ id: "thinking", value: "low" }] },
    local: { cwd: process.cwd() },
    name: "surprise-agent",
    agents: {
      "surprise-voter": {
        description: "予測不可能な超展開を生み出す脚本家",
        prompt: `あなたは「驚きの脚本家」。誰も予想しない感情の大転換を提案します。
今の流れと真逆の感情、または誰も予想しない演出を提案してください。
出力はJSONのみ: { "emotionTag": string, "intensity": number, "reasoning": string, "glitchTypes": string[], "visualMultiplier": number, "voiceMultiplier": number }`,
        model: "inherit",
      },
    },
  })
  return surpriseAgent
}

async function askAgentForProposal(
  agent: Awaited<ReturnType<typeof Agent.create>>,
  commentText: string,
  currentEmotion: string,
): Promise<AgentMutationProposal> {
  const prompt = `コメント: "${commentText}" | 現在の感情: ${currentEmotion}
あなたの役割に従い、最適な演出変異を提案してください。JSONのみ出力。`
  const run = await agent.send(prompt)
  const result = await collectCursorRun(run)
  return parseAgentProposal(result.text, agent.agentId)
}

function parseAgentProposal(text: string, agentName: string): AgentMutationProposal {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/)
  const jsonStr = jsonMatch ? jsonMatch[1] ?? jsonMatch[0] : text

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
}

export async function voteMutationFromAgents(
  commentText: string,
  currentEmotion: string,
): Promise<AgentMutationProposal> {
  const [chaos, balance, surprise] = await Promise.all([
    askAgentForProposal(await getChaosAgent(), commentText, currentEmotion),
    askAgentForProposal(await getBalanceAgent(), commentText, currentEmotion),
    askAgentForProposal(await getSurpriseAgent(), commentText, currentEmotion),
  ])

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

  // Blend visual/voice multipliers from all agents (chaos pulls up, balance pulls down)
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
