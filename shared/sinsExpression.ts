import type { CharacterSinName, CharacterSinValues } from "./characterState.js"

/**
 * Visual modulation parameters derived from the 7-sin character state.
 * Each modifier is a small multiplier or signed offset around its baseline.
 * Avatar components consume these to subtly shift idle behavior so the
 * persona's tendencies "leak" through posture, gaze, blink, sway, etc.,
 * without ever surfacing the underlying sin names or numbers.
 */
export type SinExpressionModifiers = {
  /** Multiplier for the next-blink delay. >1 = blinks less often (sloth↑). */
  blinkIntervalMul: number
  /** Multiplier for limb sway amplitude. <1 = limper (sloth↑), >1 = bouncier (gluttony↑). */
  swayAmplitudeMul: number
  /** Multiplier for limb sway period. >1 = slower (sloth↑), <1 = quicker (wrath↑). */
  swayPeriodMul: number
  /** Additive offset to baseline blush opacity (0..1). lust↑ → warmer. */
  blushBaseline: number
  /** Eye openness (0..1, 1 = fully open). sloth↑ → droopy, pride↑ → slightly narrowed. */
  eyeOpenness: number
  /** Signed horizontal pupil shift in eye-local units (-1..1). envy↑ → occasional side-glance. */
  sideGlanceX: number
  /** Pupil/highlight scale multiplier (greed↑ → larger, "want it"). */
  pupilScale: number
  /** Smile curvature offset (-1..1). wrath↑ → frown, lust↑ → softer/upturned. */
  smileCurve: number
  /** Signed chin lift in normalized units (pride↑ → looks down nose). */
  chinLift: number
}

/**
 * Compact bundle passed from App → Stage → SvgAvatar → CatlinV2Avatar.
 * `dominant` is the single most-pronounced sin (>= dominantThreshold), or null.
 * `microTell` is a transient: set by the producer when an event should trigger
 * a one-shot reaction. Consumers should only react on rising edges.
 */
export type SinExpressionSignal = {
  dominant: CharacterSinName | null
  intensities: CharacterSinValues
  modifiers: SinExpressionModifiers
  microTell: CharacterSinName | null
}

export type SinExpressionOptions = {
  /** Sin value at/above which a sin is considered "dominant" enough to flag. */
  dominantThreshold?: number
  /** Optional override for the microTell field (event-driven). */
  microTell?: CharacterSinName | null
}

const DEFAULT_DOMINANT_THRESHOLD = 65

/**
 * Pure conversion from 7-sin scores to avatar modulation parameters.
 * Intentionally conservative: every modifier stays inside its "safe" range
 * so that combined effects can't overshoot into uncanny territory.
 */
export function computeSinExpressionSignal(
  sins: CharacterSinValues,
  options: SinExpressionOptions = {},
): SinExpressionSignal {
  const threshold = options.dominantThreshold ?? DEFAULT_DOMINANT_THRESHOLD

  // sloth dominates blink rate, wrath nudges it faster.
  const blinkIntervalMul = clamp(
    1 + bias(sins.sloth, 50, 0.6) - bias(sins.wrath, 50, 0.25),
    0.55,
    2.0,
  )

  // gluttony boosts limb sway, sloth dampens, wrath also dampens (tense).
  const swayAmplitudeMul = clamp(
    1 + bias(sins.gluttony, 50, 0.35) - bias(sins.sloth, 50, 0.45) - bias(sins.wrath, 50, 0.15),
    0.55,
    1.5,
  )

  // sloth slows the period (longer breaths), wrath shortens it (twitchier).
  const swayPeriodMul = clamp(
    1 + bias(sins.sloth, 50, 0.4) - bias(sins.wrath, 50, 0.25),
    0.65,
    1.6,
  )

  // lust adds warmth, wrath warms in a different way (flush). Bounded [-0.2, +0.4].
  const blushBaseline = clamp(
    bias(sins.lust, 50, 0.3) + bias(sins.wrath, 60, 0.15),
    -0.2,
    0.4,
  )

  // sloth makes eyes droopier; pride narrows them slightly (cool).
  const eyeOpenness = clamp(
    1 - bias(sins.sloth, 50, 0.35) - bias(sins.pride, 60, 0.12),
    0.55,
    1.05,
  )

  // envy generates baseline glance bias; sign chosen deterministically by consumer.
  const sideGlanceX = clamp(bias(sins.envy, 55, 0.5), -0.45, 0.45)

  // greed dilates pupils ("want"), lust adds a little sparkle scale too.
  const pupilScale = clamp(
    1 + bias(sins.greed, 50, 0.25) + bias(sins.lust, 60, 0.1),
    0.8,
    1.45,
  )

  // wrath pulls smile down, lust pulls up. Pride slightly cool/flat.
  const smileCurve = clamp(
    bias(sins.lust, 55, 0.4) - bias(sins.wrath, 55, 0.6) - bias(sins.pride, 70, 0.1),
    -1,
    1,
  )

  // pride raises chin slightly (looks down at viewer).
  const chinLift = clamp(bias(sins.pride, 55, 0.5), -0.3, 0.6)

  return {
    dominant: pickDominantSin(sins, threshold),
    intensities: sins,
    modifiers: {
      blinkIntervalMul,
      swayAmplitudeMul,
      swayPeriodMul,
      blushBaseline,
      eyeOpenness,
      sideGlanceX,
      pupilScale,
      smileCurve,
      chinLift,
    },
    microTell: options.microTell ?? null,
  }
}

export function pickDominantSin(
  sins: CharacterSinValues,
  threshold: number = DEFAULT_DOMINANT_THRESHOLD,
): CharacterSinName | null {
  let best: { name: CharacterSinName; value: number } | null = null
  for (const [name, value] of Object.entries(sins) as Array<[CharacterSinName, number]>) {
    if (value < threshold) continue
    if (best === null || value > best.value) {
      best = { name, value }
    }
  }
  return best?.name ?? null
}

/** Default modifier set (all sins == 50). Useful as a fallback for tests / SSR. */
export function defaultSinExpressionModifiers(): SinExpressionModifiers {
  return {
    blinkIntervalMul: 1,
    swayAmplitudeMul: 1,
    swayPeriodMul: 1,
    blushBaseline: 0,
    eyeOpenness: 1,
    sideGlanceX: 0,
    pupilScale: 1,
    smileCurve: 0,
    chinLift: 0,
  }
}

function bias(value: number, midpoint: number, scale: number): number {
  return ((value - midpoint) / 50) * scale
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
