import { describe, expect, it } from 'vitest'

import { normalizeCharacterSinValues } from './characterState.js'
import {
  computeDiscoveryEnableBias,
  computeNoveltyTarget,
  computeSuggestionWeights,
  describeToneDirective,
} from './sinsBias.js'

const sins = (overrides: Partial<ReturnType<typeof normalizeCharacterSinValues>> = {}) =>
  normalizeCharacterSinValues({ pride: 60, ...overrides })

describe('computeSuggestionWeights', () => {
  it('ramps chapter-break weight at turn thresholds', () => {
    const cases = [
      { name: 'below threshold', turnsSinceChapterBreak: 9, expected: 0 },
      { name: 'soft threshold', turnsSinceChapterBreak: 10, expected: 1.0 },
      { name: 'hard threshold', turnsSinceChapterBreak: 14, expected: 1.8 },
    ]

    for (const testCase of cases) {
      const weights = computeSuggestionWeights(sins(), {
        assistantTurnCount: 20,
        turnsSinceChapterBreak: testCase.turnsSinceChapterBreak,
      })
      expect(weights['chapter-break'], testCase.name).toBeCloseTo(testCase.expected)
    }
  })

  it('keeps baseline weights for standard surface suggestions', () => {
    const weights = computeSuggestionWeights(sins(), {
      assistantTurnCount: 3,
      turnsSinceChapterBreak: 0,
    })

    for (const id of ['mini-corner', 'recap', 'teaser'] as const) {
      expect(weights[id], id).toBeGreaterThan(0)
    }

    expect(computeSuggestionWeights(sins(), { assistantTurnCount: 0 }).opening).toBeGreaterThan(0)
  })
})

describe('computeDiscoveryEnableBias', () => {
  it('enables discovery sources from sin bias', () => {
    const cases = [
      {
        name: 'greed enables mcp and topic rotation remains enabled',
        input: sins({ greed: 80 }),
        expected: { mcp: true, 'topic-rotation': true },
      },
      {
        name: 'envy enables mcp',
        input: sins({ envy: 80 }),
        expected: { mcp: true },
      },
      {
        name: 'sloth enables self history',
        input: sins({ sloth: 45 }),
        expected: { 'self-history': true },
      },
      {
        name: 'pride enables self history',
        input: sins({ pride: 55 }),
        expected: { 'self-history': true },
      },
      {
        name: 'season is always enabled',
        input: sins({ greed: 0, envy: 0, sloth: 0, pride: 0 }),
        expected: { season: true },
      },
    ]

    for (const testCase of cases) {
      expect(computeDiscoveryEnableBias(testCase.input), testCase.name).toMatchObject(testCase.expected)
    }
  })
})

describe('computeNoveltyTarget', () => {
  it('applies sin deltas and clamps to the supported range', () => {
    const cases = [
      { name: 'neutral base with pride at midpoint', input: sins(), expected: 50 },
      { name: 'envy adds novelty pressure', input: sins({ envy: 100 }), expected: 70 },
      { name: 'greed adds novelty pressure', input: sins({ greed: 100 }), expected: 60 },
      { name: 'sloth lowers novelty pressure', input: sins({ sloth: 100 }), expected: 35 },
      { name: 'pride lowers novelty pressure from its midpoint', input: sins({ pride: 100 }), expected: 46 },
      { name: 'upper clamp', input: sins({ envy: 100, greed: 100, sloth: 0, pride: 0 }), expected: 85 },
      { name: 'lower clamp', input: sins({ envy: 0, greed: 0, sloth: 100, pride: 100 }), expected: 25 },
    ]

    for (const testCase of cases) {
      expect(computeNoveltyTarget(testCase.input), testCase.name).toBe(testCase.expected)
    }
  })
})

describe('describeToneDirective', () => {
  it('returns a non-empty directive string', () => {
    const directive = describeToneDirective(sins())

    expect(typeof directive).toBe('string')
    expect(directive.length).toBeGreaterThan(0)
  })
})
