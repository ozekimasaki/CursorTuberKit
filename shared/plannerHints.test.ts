import { describe, expect, it } from 'vitest'

import type { CharacterSinValues } from './characterState.js'
import { derivePlannerHints, type PlannerHintsCtx } from './plannerHints.js'

const sins = (overrides: Partial<CharacterSinValues> = {}): CharacterSinValues => ({
  envy: 0,
  gluttony: 0,
  greed: 0,
  lust: 0,
  pride: 0,
  sloth: 0,
  wrath: 0,
  ...overrides,
})

const ctx = (overrides: Partial<PlannerHintsCtx> = {}): PlannerHintsCtx => ({
  recentNoveltyAverage: 50,
  openThreadCount: 0,
  suggestion: null,
  ...overrides,
})

describe('derivePlannerHints', () => {
  it('derives mood shift and deep callback hints from table cases', () => {
    const cases = [
      {
        name: 'all zeros',
        sins: sins(),
        ctx: ctx(),
        expected: { wantMoodShift: false, wantDeepCallback: false },
      },
      {
        name: 'high sloth and envy with low novelty wants mood shift',
        sins: sins({ sloth: 80, envy: 80 }),
        ctx: ctx({ recentNoveltyAverage: 30 }),
        expected: { wantMoodShift: true, wantDeepCallback: false },
      },
      {
        name: 'high novelty blocks mood shift',
        sins: sins({ sloth: 80, envy: 80 }),
        ctx: ctx({ recentNoveltyAverage: 60 }),
        expected: { wantMoodShift: false, wantDeepCallback: false },
      },
      {
        name: 'low sin average blocks mood shift',
        sins: sins({ sloth: 30, envy: 30 }),
        ctx: ctx({ recentNoveltyAverage: 30 }),
        expected: { wantMoodShift: false, wantDeepCallback: false },
      },
      {
        name: 'recap suggestion wants deep callback regardless of pride',
        sins: sins({ pride: 0 }),
        ctx: ctx({ openThreadCount: 3, suggestion: 'recap' }),
        expected: { wantMoodShift: false, wantDeepCallback: true },
      },
      {
        name: 'high pride wants deep callback',
        sins: sins({ pride: 80 }),
        ctx: ctx({ openThreadCount: 3, suggestion: 'opening' }),
        expected: { wantMoodShift: false, wantDeepCallback: true },
      },
      {
        name: 'low pride does not want deep callback without recap',
        sins: sins({ pride: 20 }),
        ctx: ctx({ openThreadCount: 3, suggestion: 'opening' }),
        expected: { wantMoodShift: false, wantDeepCallback: false },
      },
      {
        name: 'single open thread blocks deep callback',
        sins: sins({ pride: 80 }),
        ctx: ctx({ openThreadCount: 1, suggestion: 'opening' }),
        expected: { wantMoodShift: false, wantDeepCallback: false },
      },
      {
        name: 'mood shift sin threshold includes exactly 55 average',
        sins: sins({ sloth: 55, envy: 55 }),
        ctx: ctx({ recentNoveltyAverage: 30 }),
        expected: { wantMoodShift: true, wantDeepCallback: false },
      },
      {
        name: 'mood shift sin threshold excludes 54.9 average',
        sins: sins({ sloth: 54.9, envy: 54.9 }),
        ctx: ctx({ recentNoveltyAverage: 30 }),
        expected: { wantMoodShift: false, wantDeepCallback: false },
      },
      {
        name: 'mood shift novelty threshold excludes exactly 45',
        sins: sins({ sloth: 80, envy: 80 }),
        ctx: ctx({ recentNoveltyAverage: 45 }),
        expected: { wantMoodShift: false, wantDeepCallback: false },
      },
    ]

    for (const testCase of cases) {
      expect(derivePlannerHints(testCase.sins, testCase.ctx), testCase.name).toEqual(testCase.expected)
    }
  })
})
