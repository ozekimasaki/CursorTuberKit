import type { CharacterSinValues } from "./characterState.js"

export type PlannerHintsCtx = {
  recentNoveltyAverage: number
  openThreadCount: number
  suggestion: string | null
}

export type PlannerHints = {
  wantMoodShift: boolean
  wantDeepCallback: boolean
}

export function derivePlannerHints(
  sins: CharacterSinValues,
  ctx: PlannerHintsCtx,
): PlannerHints {
  const wantMoodShift = (sins.sloth + sins.envy) / 2 >= 55 && ctx.recentNoveltyAverage < 45
  const wantDeepCallback =
    ctx.openThreadCount >= 2 && (ctx.suggestion === "recap" || sins.pride >= 55)

  return { wantMoodShift, wantDeepCallback }
}
