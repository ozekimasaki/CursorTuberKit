import { describe, expect, it } from 'vitest'

import {
  applyLexicalPenalty,
  computeLexicalOverlapPenalty,
  toCharNGrams,
} from './lexicalOverlap.js'

describe('lexical overlap helpers', () => {
  it('builds character n-grams for short strings', () => {
    expect(toCharNGrams('あいう', 3)).toEqual(new Set(['あいう']))
  })

  it('computes lexical overlap penalties', () => {
    const cases = [
      { name: 'empty summary', summary: '', recentTurns: ['同じ話題'], expected: 0 },
      { name: 'empty corpus', summary: '同じ話題', recentTurns: [], expected: 0 },
      { name: 'identical corpus', summary: 'アールグレイの香り', recentTurns: ['アールグレイの香り'], expected: 1 },
      { name: 'orthogonal corpus', summary: 'アールグレイの香り', recentTurns: ['星空と月明かり'], expected: 0 },
    ]

    for (const testCase of cases) {
      expect(
        computeLexicalOverlapPenalty(testCase.summary, testCase.recentTurns),
        testCase.name,
      ).toBeCloseTo(testCase.expected)
    }
  })

  it('applies lexical penalty threshold and floor', () => {
    const cases = [
      { name: 'below threshold unchanged', score: 80, overlap: 0.44, expected: 80 },
      { name: 'above threshold penalized', score: 80, overlap: 0.5, expectedMin: 32, expectedMax: 79 },
      { name: 'high overlap clamps at factor floor', score: 80, overlap: 1, expected: 32 },
    ]

    for (const testCase of cases) {
      const actual = applyLexicalPenalty(testCase.score, testCase.overlap)
      if ('expected' in testCase) {
        expect(actual, testCase.name).toBe(testCase.expected)
      } else {
        expect(actual, testCase.name).toBeGreaterThanOrEqual(testCase.expectedMin)
        expect(actual, testCase.name).toBeLessThanOrEqual(testCase.expectedMax)
      }
    }
  })
})
