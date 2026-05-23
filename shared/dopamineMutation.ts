/**
 * Dopamine mutation system types.
 *
 * Fast, lightweight visual + persona mutations triggered by viewer comments.
 * Designed for high-frequency changes (every 15-30 seconds).
 */

export type MutationPhase = "idle" | "triggered" | "morphing" | "morphed" | "reverting"

export type MutationCueKind =
  | "comment_emotion"
  | "comment_keyword"
  | "manual"
  | "autopilot_boredom"
  | "chain_reaction"
  | "ai_director"
  | "agent_vote"
  | "mutant_effect"

export type MutationCue = {
  kind: MutationCueKind
  text?: string
  emotionTag?: string
  intensity: number // 0..1
  receivedAt: string
  /** AI agent-provided override metadata */
  meta?: {
    glitchTypes?: string[]
    visualMultiplier?: number
    voiceMultiplier?: number
    reasoning?: string
    agentName?: string
  }
}

export type VisualMutationParams = {
  /** Background hue rotation in degrees */
  backgroundHueShift: number
  /** Background saturation multiplier */
  backgroundSatMul: number
  /** Caption color override (CSS color string or null) */
  captionColor: string | null
  /** Caption font weight */
  captionWeight: number
  /** Caption font size scale multiplier */
  captionSizeMul: number
  /** Glitch intensity 0..1 */
  glitchIntensity: number
  /** Shake intensity on avatar 0..1 */
  shakeIntensity: number
  /** Border/frame glow color (CSS color or null) */
  frameGlowColor: string | null
  /** Duration of the morphing effect in ms */
  morphDurationMs: number
  /** Background preset id override (null = no change) */
  backgroundPresetId: string | null
}

export type VoiceMutationParams = {
  /** VOICEVOX speedScale delta (-0.5..+0.5) */
  speedDelta: number
  /** VOICEVOX pitchScale delta (-0.15..+0.15) */
  pitchDelta: number
  /** VOICEVOX intonationScale delta (-0.3..+0.3) */
  intonationDelta: number
  /** Speaker id override (null = keep current) */
  speakerId: number | null
}

export type PersonaMutation = {
  id: string
  previousPrompt: string
  nextPrompt: string
  summary: string
  monologue: string
  cue: MutationCue
  appliedAt: string
  /** Whether this was a partial (failed) mutation */
  partial: boolean
}

export type AgentMutationProposal = {
  agentName: string
  emotionTag: string
  intensity: number
  reasoning: string
  glitchTypes: string[]
  visualMultiplier: number
  voiceMultiplier: number
}

export type GeneratedEffect = {
  id: string
  name: string
  cssKeyframes: string
  cssClass: string
  createdAt: string
}

export type DirectorDecision = {
  emotionTag: string
  intensity: number
  reasoning: string
  glitchTypes: string[]
  visualMultiplier: number
  voiceMultiplier: number
  shouldMutant: boolean
}

export type DopamineState = {
  phase: MutationPhase
  /** Current visual params (may be animating) */
  visual: VisualMutationParams
  /** Target visual params after morph completes */
  targetVisual: VisualMutationParams
  /** Current voice overrides */
  voice: VoiceMutationParams
  /** Stack of persona mutations (most recent first) */
  personaHistory: PersonaMutation[]
  /** Cooldown timestamp for next heavy mutation */
  heavyCooldownUntil: number
  /** Current mutation cue that triggered the active effect */
  activeCue: MutationCue | null
  /** Latest AI director decision (for display/debug) */
  lastDirectorDecision: DirectorDecision | null
  /** Active generated effects applied */
  activeGeneratedEffects: GeneratedEffect[]
}

export const DEFAULT_VISUAL_MUTATION: VisualMutationParams = {
  backgroundHueShift: 0,
  backgroundSatMul: 1,
  captionColor: null,
  captionWeight: 400,
  captionSizeMul: 1,
  glitchIntensity: 0,
  shakeIntensity: 0,
  frameGlowColor: null,
  morphDurationMs: 3000,
  backgroundPresetId: null,
}

export const DEFAULT_VOICE_MUTATION: VoiceMutationParams = {
  speedDelta: 0,
  pitchDelta: 0,
  intonationDelta: 0,
  speakerId: null,
}

export function createDefaultDopamineState(): DopamineState {
  return {
    phase: "idle",
    visual: { ...DEFAULT_VISUAL_MUTATION },
    targetVisual: { ...DEFAULT_VISUAL_MUTATION },
    voice: { ...DEFAULT_VOICE_MUTATION },
    personaHistory: [],
    heavyCooldownUntil: 0,
    activeCue: null,
    lastDirectorDecision: null,
    activeGeneratedEffects: [],
  }
}

/** Map simple emotion keywords to hue shifts */
export function emotionToHueShift(emotion: string): number {
  switch (emotion) {
    case "angry":
    case "怒り":
      return 0 // red
    case "happy":
    case "喜び":
      return 50 // yellow/gold
    case "sad":
    case "悲しみ":
      return 220 // blue
    case "surprised":
    case "驚き":
      return 280 // purple
    case "disgust":
    case "嫌悪":
      return 90 // green
    case "fear":
    case "恐怖":
      return 180 // cyan
    case "love":
    case "好き":
      return 320 // pink
    default:
      return Math.floor(Math.random() * 360)
  }
}

/** Infer a simple emotion tag from Japanese text for quick client-side mapping */
export function inferQuickEmotion(text: string): string {
  const t = text.toLowerCase()
  if (/[怒ムカつ|ブチ|かっか|イライラ|むか|ぷんぷん|アホ|バカ|死ね|クソ|うざ|ざまぁ|最低]/.test(t)) return "angry"
  if (/[嬉し|うれし|やった|最高|すごい|天才|かわいい|好き|愛してる|大好き|尊い|神|ありがと|感謝]/.test(t)) return "happy"
  if (/[悲し|かなし|泣|涙|つらい|しんどい|辛い|苦しい|さみし|寂し|ぴえん]/.test(t)) return "sad"
  if (/[!?！？]{2,}|えっ|マジ|嘘|ビックリ|驚|ヤバ|やば|わっ|うわ/.test(t)) return "surprised"
  if (/[苦手|嫌い|うぇ|気持ち悪|気色悪|はぁ\?|はぁ\?|だるい]/.test(t)) return "disgust"
  if (/[怖い|こわい|ひぃ|震え|パニック|やばい.*怖]/.test(t)) return "fear"
  if (/[好き|スキ|すき|愛|らぶ|萌え|もえ]/.test(t)) return "love"
  return "neutral"
}

/** Build a MutationCue from a viewer comment text */
export function buildCommentCue(text: string, receivedAt: string): MutationCue {
  const emotion = inferQuickEmotion(text)
  const intensity = Math.min(1, Math.max(0.3, text.length / 20))
  return {
    kind: "comment_emotion",
    text,
    emotionTag: emotion,
    intensity,
    receivedAt,
  }
}

/** Compute visual params from a cue instantly (no AI needed) */
export function cueToVisualParams(cue: MutationCue): VisualMutationParams {
  const hueShift = emotionToHueShift(cue.emotionTag ?? "neutral")
  const baseIntensity = cue.intensity
  const vm = cue.meta?.visualMultiplier ?? 1
  const vmClamped = Math.min(3, Math.max(0.3, vm))

  return {
    backgroundHueShift: hueShift,
    backgroundSatMul: 1 + baseIntensity * 0.5 * vmClamped,
    captionColor: pickCaptionColor(cue.emotionTag ?? "neutral"),
    captionWeight: 400 + Math.floor(baseIntensity * 300 * vmClamped),
    captionSizeMul: 1 + baseIntensity * 0.3 * vmClamped,
    glitchIntensity: cue.kind === "chain_reaction" ? 0.95 : Math.min(1.0, baseIntensity * 1.2 * vmClamped),
    shakeIntensity: cue.kind === "chain_reaction" ? 1.0 : Math.min(1.0, baseIntensity * 1.0 * vmClamped),
    frameGlowColor: pickGlowColor(cue.emotionTag ?? "neutral"),
    morphDurationMs: 1500 + Math.floor(baseIntensity * 1500),
    backgroundPresetId: emotionToBackgroundPresetId(cue.emotionTag ?? "neutral"),
  }
}

function pickCaptionColor(emotion: string): string | null {
  switch (emotion) {
    case "angry":
      return "#ff4444"
    case "happy":
      return "#ffee88"
    case "sad":
      return "#88ccff"
    case "surprised":
      return "#cc88ff"
    case "disgust":
      return "#88ff88"
    case "fear":
      return "#88ffff"
    case "love":
      return "#ff88cc"
    default:
      return null
  }
}

function pickGlowColor(emotion: string): string | null {
  switch (emotion) {
    case "angry":
      return "rgba(255, 0, 0, 0.4)"
    case "happy":
      return "rgba(255, 220, 0, 0.3)"
    case "sad":
      return "rgba(0, 128, 255, 0.3)"
    case "surprised":
      return "rgba(180, 0, 255, 0.3)"
    case "disgust":
      return "rgba(0, 255, 0, 0.3)"
    case "fear":
      return "rgba(0, 255, 255, 0.3)"
    case "love":
      return "rgba(255, 0, 128, 0.3)"
    default:
      return null
  }
}

/** Compute voice mutation params from a cue */
export function cueToVoiceParams(cue: MutationCue): VoiceMutationParams {
  const emotion = cue.emotionTag ?? "neutral"
  const vo = cue.meta?.voiceMultiplier ?? 1
  const voClamped = Math.min(3, Math.max(0.3, vo))
  const base = (() => {
    switch (emotion) {
      case "angry":
        return { speedDelta: 0.2, pitchDelta: 0.08, intonationDelta: 0.2, speakerId: null }
      case "happy":
        return { speedDelta: 0.1, pitchDelta: 0.05, intonationDelta: 0.15, speakerId: null }
      case "sad":
        return { speedDelta: -0.15, pitchDelta: -0.08, intonationDelta: -0.2, speakerId: null }
      case "surprised":
        return { speedDelta: 0.15, pitchDelta: 0.1, intonationDelta: 0.25, speakerId: null }
      case "fear":
        return { speedDelta: 0.1, pitchDelta: 0.05, intonationDelta: -0.1, speakerId: null }
      case "love":
        return { speedDelta: -0.05, pitchDelta: -0.03, intonationDelta: 0.1, speakerId: null }
      default:
        return { speedDelta: 0, pitchDelta: 0, intonationDelta: 0, speakerId: null }
    }
  })()
  return {
    speedDelta: Math.max(-0.5, Math.min(0.5, base.speedDelta * voClamped)),
    pitchDelta: Math.max(-0.15, Math.min(0.15, base.pitchDelta * voClamped)),
    intonationDelta: Math.max(-0.3, Math.min(0.3, base.intonationDelta * voClamped)),
    speakerId: base.speakerId,
  }
}

/** Map emotion to a background preset id for auto-switching */
export function emotionToBackgroundPresetId(emotion: string): string | null {
  switch (emotion) {
    case "angry":
      return "atm-sunset" // 赤系の激しい夕焼け
    case "happy":
      return "atm-dawn-sky" // 明るい朝空
    case "sad":
      return "atm-twilight-stars" // 暗い星空
    case "surprised":
      return "atm-aurora" // 神秘的なオーロラ
    case "disgust":
      return "abs-ink-wash" // 暗いインク
    case "fear":
      return "abs-neon-void" // 暗いネオン
    case "love":
      return "atm-nebula" // 幻想的な星雲
    default:
      return null
  }
}
