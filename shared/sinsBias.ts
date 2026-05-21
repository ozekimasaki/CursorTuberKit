import type { CharacterSinValues } from "./characterState.js"
import type { AutopilotPlannerSource, AutopilotSuggestionId } from "./autopilot.js"

export type SuggestionWeights = Record<AutopilotSuggestionId, number>

export type SuggestionContext = {
  assistantTurnCount: number
  openThreadCount?: number
  turnsSinceChapterBreak?: number
  recentNoveltyAverage?: number
}

export function computeSuggestionWeights(
  sins: CharacterSinValues,
  ctx: SuggestionContext,
): SuggestionWeights {
  const assistantTurnCount = Math.max(0, ctx.assistantTurnCount)
  const turnsSinceChapterBreak = ctx.turnsSinceChapterBreak ?? assistantTurnCount

  const baseMini = 1.0 + bias(sins.gluttony, 50, 1.2) + bias(sins.greed, 50, 0.6)
  const baseRecap = 0.6 + bias(sins.sloth, 50, 1.0) + bias(sins.pride, 60, 0.6)
  const baseTeaser = 0.7 + bias(50, sins.sloth, 1.0) + bias(sins.greed, 50, 0.6) + bias(sins.envy, 50, 0.4)
  const baseOpening = 0.2 + bias(sins.pride, 60, 0.4)

  let chapterBreak: number
  if (turnsSinceChapterBreak < 10) {
    chapterBreak = 0
  } else if (turnsSinceChapterBreak < 14) {
    chapterBreak = 1.0 + bias(sins.envy, 50, 0.4) + bias(50, sins.sloth, 0.3)
  } else {
    chapterBreak = 1.8 + bias(sins.envy, 50, 0.5)
  }

  return {
    "mini-corner": Math.max(0.05, baseMini),
    recap: assistantTurnCount < 3 ? 0.0 : Math.max(0.05, baseRecap),
    teaser: assistantTurnCount < 2 ? 0.0 : Math.max(0.05, baseTeaser),
    opening: assistantTurnCount === 0 ? Math.max(1.5, baseOpening) : 0.0,
    "chapter-break": Math.max(0, chapterBreak),
  }
}

/**
 * Deterministic weighted pick driven by a sequence counter so playback stays repeatable.
 */
export function pickWeightedSuggestion(weights: SuggestionWeights, sequence: number): AutopilotSuggestionId {
  const entries = (Object.entries(weights) as Array<[AutopilotSuggestionId, number]>).filter(([, value]) => value > 0)

  if (entries.length === 0) {
    return "mini-corner"
  }

  const total = entries.reduce((sum, [, value]) => sum + value, 0)
  if (total <= 0) {
    return entries[0]?.[0] ?? "mini-corner"
  }

  const fraction = ((sequence * 2654435761) % 1_000_000) / 1_000_000
  let cursor = fraction * total

  for (const [id, value] of entries) {
    cursor -= value
    if (cursor <= 0) {
      return id
    }
  }

  return entries[entries.length - 1]?.[0] ?? "mini-corner"
}

export function describeToneDirective(sins: CharacterSinValues): string {
  const energy = clampLevel(sins.gluttony * 0.5 + sins.greed * 0.5)
  const warmth = clampLevel(sins.lust * 0.6 + sins.envy * 0.4)
  const restraint = clampLevel(sins.pride * 0.5 + sins.wrath * 0.5)
  const pacing = sins.sloth >= 60 ? "ゆったり" : sins.sloth <= 40 ? "テンポ早め" : "ふつう"

  const lengthCap = sins.sloth >= 65 ? "短め(60〜90字)" : sins.sloth <= 35 ? "やや長め(110〜160字)" : "普通(80〜120字)"

  const noveltyTarget = computeNoveltyTarget(sins)

  return [
    `テンション=${energy}`,
    `親密度=${warmth}`,
    `品の保ち=${restraint}`,
    `話す速度=${pacing}`,
    `1ターン目安=${lengthCap}`,
    `目標novelty=${noveltyTarget}`,
  ].join(" / ")
}

/**
 * Sin-derived enable bias for discovery sources. Used by the aggregator to
 * decide which optional sources to fetch when the client didn't explicitly
 * toggle them.
 */
export function computeDiscoveryEnableBias(
  sins: CharacterSinValues,
): Record<Exclude<AutopilotPlannerSource, "viewer" | "self" | "memkraft" | "time">, boolean> {
  return {
    "wikipedia-tea": true,
    mcp: sins.greed >= 45 || sins.envy >= 45,
    season: true,
    "topic-rotation": true,
    "self-history": sins.sloth >= 45 || sins.pride >= 55,
  }
}

/**
 * Sin-derived target for the planner's self-reported noveltyScore (0-100).
 * Higher envy/greed → demand more novelty; high sloth → accept comfort/recap.
 */
export function computeNoveltyTarget(sins: CharacterSinValues): number {
  let base = 50
  base += bias(sins.envy, 50, 20)
  base += bias(sins.greed, 50, 10)
  base -= bias(sins.sloth, 50, 15)
  base -= bias(sins.pride, 60, 5)
  return Math.max(25, Math.min(85, Math.round(base)))
}

function bias(value: number, midpoint: number, scale: number): number {
  return ((value - midpoint) / 50) * scale
}

function clampLevel(value: number): string {
  if (value >= 75) return "強"
  if (value >= 55) return "やや強"
  if (value >= 40) return "中"
  if (value >= 25) return "やや弱"
  return "弱"
}
