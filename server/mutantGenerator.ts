import { Agent } from "@cursor/sdk"
import { collectCursorRun } from "./cursorSdkRun.js"
import { validateCursorConfiguration } from "./cursorAgent.js"
import type { GeneratedEffect } from "../shared/dopamineMutation.js"

let mutantAgent: Awaited<ReturnType<typeof Agent.create>> | null = null
const generatedEffects: GeneratedEffect[] = []

async function getMutantAgent() {
  if (mutantAgent) return mutantAgent
  validateCursorConfiguration()
  mutantAgent = await Agent.create({
    apiKey: process.env.CURSOR_API_KEY!,
    model: { id: "composer-2.5", params: [{ id: "thinking", value: "low" }] },
    local: { cwd: process.cwd() },
    name: "mutant-generator",
  })
  return mutantAgent
}

export async function generateDynamicEffect(requestText: string): Promise<GeneratedEffect> {
  const agent = await getMutantAgent()

  const prompt = `あなたはVTuber配信の「動的エフェクト生成AI」です。
視聴者のリクエストに基づき、CSSアニメーション（keyframes + class）を生成してください。

## リクエスト
"${requestText}"

## 出力形式（JSONのみ）
{
  "name": "エフェクト名",
  "cssKeyframes": "@keyframes dopamine-custom-xxx { ... }",
  "cssClass": ".dopamine-custom-xxx { animation: dopamine-custom-xxx 1.5s ease-in-out; }"
}

## 制約
- keyframes名は必ず "dopamine-custom-" + 一意な名前 で始める
- 既存のUI（字幕・コメント）に干渉しないよう、絶対にposition/property/z-indexは操作しない
- transform, filter, opacity のみ使用
- 最大2秒で完了するアニメーション
- メモリリークを防ぐため、100%で元の状態に戻る`

  const run = await agent.send(prompt)
  const result = await collectCursorRun(run)
  const effect = parseGeneratedEffect(result.text)
  generatedEffects.push(effect)
  return effect
}

function parseGeneratedEffect(text: string): GeneratedEffect {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/)
  const jsonStr = jsonMatch ? jsonMatch[1] ?? jsonMatch[0] : text

  try {
    const data = JSON.parse(jsonStr) as Record<string, unknown>
    const id = `mutant-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    return {
      id,
      name: String(data.name || "Custom Effect"),
      cssKeyframes: String(data.cssKeyframes || ""),
      cssClass: String(data.cssClass || ""),
      createdAt: new Date().toISOString(),
    }
  } catch {
    const id = `mutant-fallback-${Date.now()}`
    return {
      id,
      name: "Fallback Shake",
      cssKeyframes: `@keyframes ${id} { 0%,100%{transform:translate(0)} 25%{transform:translate(-4px,2px)} 50%{transform:translate(4px,-2px)} 75%{transform:translate(-2px,-4px)} }`,
      cssClass: `.${id} { animation: ${id} 0.8s ease-in-out; }`,
      createdAt: new Date().toISOString(),
    }
  }
}

export function getGeneratedEffects(): GeneratedEffect[] {
  return [...generatedEffects]
}

export function clearGeneratedEffects() {
  generatedEffects.length = 0
}
