import { Agent } from "@cursor/sdk"
import type { GeneratedEffect } from "../shared/dopamineMutation.js"

const generatedEffects: GeneratedEffect[] = []

export async function generateDynamicEffect(requestText: string): Promise<GeneratedEffect> {
  const apiKey = process.env.CURSOR_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("CURSOR_API_KEY not set")
  }

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
- 100%で元の状態に戻る`

  try {
    const result = await Agent.prompt(prompt, {
      apiKey,
      model: { id: "composer-2.5", params: [{ id: "thinking", value: "low" }] },
      local: { cwd: process.cwd() },
    })
    const effect = parseGeneratedEffect(result.result || "")
    generatedEffects.push(effect)
    return effect
  } catch (err) {
    console.error(`[MutantGenerator] Failed: ${err instanceof Error ? err.message : String(err)}`)
    // Return fallback
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

function parseGeneratedEffect(text: string): GeneratedEffect {
  const jsonStr = extractFirstJsonObject(text)
  if (!jsonStr) {
    return createFallbackEffect()
  }

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
    return createFallbackEffect()
  }
}

function createFallbackEffect(): GeneratedEffect {
  const id = `mutant-fallback-${Date.now()}`
  return {
    id,
    name: "Fallback Shake",
    cssKeyframes: `@keyframes ${id} { 0%,100%{transform:translate(0)} 25%{transform:translate(-4px,2px)} 50%{transform:translate(4px,-2px)} 75%{transform:translate(-2px,-4px)} }`,
    cssClass: `.${id} { animation: ${id} 0.8s ease-in-out; }`,
    createdAt: new Date().toISOString(),
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

export function getGeneratedEffects(): GeneratedEffect[] {
  return [...generatedEffects]
}

export function clearGeneratedEffects() {
  generatedEffects.length = 0
}
