import { describe, expect, it } from 'vitest'

import { normalizeCharacterSinValues } from './characterState.js'
import {
  computeSinExpressionSignal,
  defaultSinExpressionModifiers,
  pickDominantSin,
} from './sinsExpression.js'

const sins = (overrides: Partial<ReturnType<typeof normalizeCharacterSinValues>> = {}) =>
  normalizeCharacterSinValues(overrides)

describe('computeSinExpressionSignal', () => {
  it('stays close to neutral modifiers when all sins are 50', () => {
    const signal = computeSinExpressionSignal(sins())
    const defaults = defaultSinExpressionModifiers()
    expect(signal.dominant).toBeNull()
    expect(signal.microTell).toBeNull()
    // Some midpoints intentionally differ from 50 (e.g. wrath baseline 55/60)
    // so 50/50 won't be perfectly neutral, but it must be a tiny delta.
    for (const key of Object.keys(defaults) as Array<keyof typeof defaults>) {
      expect(Math.abs(signal.modifiers[key] - defaults[key]), `${key} drift`).toBeLessThan(0.12)
    }
  })

  it('high sloth slows blink and dampens sway', () => {
    const signal = computeSinExpressionSignal(sins({ sloth: 95 }))
    expect(signal.modifiers.blinkIntervalMul).toBeGreaterThan(1.3)
    expect(signal.modifiers.swayAmplitudeMul).toBeLessThan(1)
    expect(signal.modifiers.swayPeriodMul).toBeGreaterThan(1.1)
    expect(signal.modifiers.eyeOpenness).toBeLessThan(0.8)
  })

  it('high gluttony increases sway amplitude', () => {
    const signal = computeSinExpressionSignal(sins({ gluttony: 90 }))
    expect(signal.modifiers.swayAmplitudeMul).toBeGreaterThan(1.15)
  })

  it('high wrath shortens sway period and frowns the mouth', () => {
    const signal = computeSinExpressionSignal(sins({ wrath: 95 }))
    expect(signal.modifiers.swayPeriodMul).toBeLessThan(1)
    expect(signal.modifiers.smileCurve).toBeLessThan(-0.2)
  })

  it('high lust warms blush and lifts the smile', () => {
    const signal = computeSinExpressionSignal(sins({ lust: 90 }))
    expect(signal.modifiers.blushBaseline).toBeGreaterThan(0.15)
    expect(signal.modifiers.smileCurve).toBeGreaterThan(0.1)
  })

  it('high greed dilates pupils', () => {
    const signal = computeSinExpressionSignal(sins({ greed: 95 }))
    expect(signal.modifiers.pupilScale).toBeGreaterThan(1.15)
  })

  it('high envy biases side glance', () => {
    const signal = computeSinExpressionSignal(sins({ envy: 95 }))
    expect(Math.abs(signal.modifiers.sideGlanceX)).toBeGreaterThan(0.2)
  })

  it('high pride lifts chin and narrows eyes slightly', () => {
    const signal = computeSinExpressionSignal(sins({ pride: 95 }))
    expect(signal.modifiers.chinLift).toBeGreaterThan(0.15)
    expect(signal.modifiers.eyeOpenness).toBeLessThan(1)
  })

  it('flags the strongest sin above the threshold as dominant', () => {
    const signal = computeSinExpressionSignal(sins({ pride: 80, sloth: 70 }))
    expect(signal.dominant).toBe('pride')
  })

  it('returns null dominant when nothing exceeds the threshold', () => {
    const signal = computeSinExpressionSignal(sins({ pride: 60, sloth: 60 }))
    expect(signal.dominant).toBeNull()
  })

  it('respects a custom dominantThreshold', () => {
    const signal = computeSinExpressionSignal(sins({ envy: 55 }), { dominantThreshold: 50 })
    expect(signal.dominant).toBe('envy')
  })

  it('passes through microTell when provided', () => {
    const signal = computeSinExpressionSignal(sins(), { microTell: 'wrath' })
    expect(signal.microTell).toBe('wrath')
  })

  it('clamps modifiers within safe envelopes even at extreme inputs', () => {
    const signal = computeSinExpressionSignal(
      sins({ sloth: 100, gluttony: 100, wrath: 100, lust: 100, greed: 100, envy: 100, pride: 100 }),
    )
    const m = signal.modifiers
    expect(m.blinkIntervalMul).toBeGreaterThanOrEqual(0.55)
    expect(m.blinkIntervalMul).toBeLessThanOrEqual(2.0)
    expect(m.swayAmplitudeMul).toBeGreaterThanOrEqual(0.55)
    expect(m.swayAmplitudeMul).toBeLessThanOrEqual(1.5)
    expect(m.swayPeriodMul).toBeGreaterThanOrEqual(0.65)
    expect(m.swayPeriodMul).toBeLessThanOrEqual(1.6)
    expect(m.blushBaseline).toBeGreaterThanOrEqual(-0.2)
    expect(m.blushBaseline).toBeLessThanOrEqual(0.4)
    expect(m.eyeOpenness).toBeGreaterThanOrEqual(0.55)
    expect(m.eyeOpenness).toBeLessThanOrEqual(1.05)
    expect(Math.abs(m.sideGlanceX)).toBeLessThanOrEqual(0.45)
    expect(m.pupilScale).toBeGreaterThanOrEqual(0.8)
    expect(m.pupilScale).toBeLessThanOrEqual(1.45)
    expect(Math.abs(m.smileCurve)).toBeLessThanOrEqual(1)
    expect(m.chinLift).toBeGreaterThanOrEqual(-0.3)
    expect(m.chinLift).toBeLessThanOrEqual(0.6)
  })
})

describe('pickDominantSin', () => {
  it('returns null when below threshold', () => {
    expect(pickDominantSin(sins(), 65)).toBeNull()
  })

  it('breaks ties by encountering greater value', () => {
    const s = sins({ pride: 80, wrath: 90 })
    expect(pickDominantSin(s, 65)).toBe('wrath')
  })
})
