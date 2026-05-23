/**
 * Maid Cat SVG Part Expression Definitions
 * Maps 15 emotions to specific part animation classes
 */

export type PartAnimation =
  // Eyes (12)
  | "eye-blink" | "eye-sparkle" | "eye-glare" | "eye-heart" | "eye-tear"
  | "eye-half-open" | "eye-wide-open" | "eye-dizzy" | "eye-glow"
  | "eye-xd" | "eye-sleepy" | "eye-angry-glow"
  // Eyebrows (8)
  | "brow-angry" | "brow-sad" | "brow-surprised" | "brow-confused"
  | "brow-happy" | "brow-determined" | "brow-worry" | "brow-flat"
  // Mouth (12)
  | "mouth-smile" | "mouth-big-smile" | "mouth-grit" | "mouth-open-surprised"
  | "mouth-sad" | "mouth-pout" | "mouth-nervous" | "mouth-tongue"
  | "mouth-cat" | "mouth-tremble" | "mouth-smirk" | "mouth-drool"
  // Blush (5)
  | "blush-hearts" | "blush-intense" | "blush-pale" | "blush-pulse" | "blush-hide"
  // Whiskers (4)
  | "whiskers-twitch" | "whiskers-flare" | "whiskers-droopy" | "whiskers-shake"
  // Tail (5)
  | "tail-wag-fast" | "tail-wag-slow" | "tail-bristle" | "tail-droopy" | "tail-heart"
  // Body (5)
  | "body-bounce-gentle" | "body-shake-intense" | "body-sway" | "body-shrink" | "body-breathe"
  // Arms/paw (6)
  | "arm-wave" | "arm-fist" | "arm-fold" | "paw-tremble" | "paw-reach" | "arm-hands-up"
  // Tray/items (5)
  | "tray-tilt" | "tray-shake" | "tea-cup-float" | "cupcake-bounce" | "tray-throw"
  // Head/headpiece (5)
  | "head-tilt" | "head-bow" | "headpiece-shake" | "headpiece-fly" | "head-nod"
  // Legs (4)
  | "legs-jump" | "legs-tremble" | "legs-cross" | "legs-kick"
  // Background UI (5)
  | "ui-glitch" | "ui-spin" | "ui-pulse" | "ui-sparkle-explode" | "ui-flicker"
  // Waist/frills (4)
  | "waist-bow-flutter" | "frills-wave" | "frills-spin" | "waist-bow-bounce"

export type MaidCatExpressionSet = {
  emotionTag: string
  parts: PartAnimation[]
  intensity: number // 0..1
}

export const maidCatExpressionPresets: Record<string, MaidCatExpressionSet> = {
  angry: {
    emotionTag: "angry",
    intensity: 0.9,
    parts: [
      "eye-glare",
      "brow-angry",
      "mouth-grit",
      "whiskers-flare",
      "tail-bristle",
      "arm-fist",
      "body-shake-intense",
      "headpiece-shake",
      "tray-throw",
      "legs-tremble",
      "ui-glitch",
      "waist-bow-flutter",
    ],
  },
  happy: {
    emotionTag: "happy",
    intensity: 0.8,
    parts: [
      "eye-sparkle",
      "brow-happy",
      "mouth-big-smile",
      "blush-hearts",
      "tail-wag-fast",
      "arm-hands-up",
      "body-bounce-gentle",
      "head-tilt",
      "cupcake-bounce",
      "legs-jump",
      "ui-sparkle-explode",
      "waist-bow-bounce",
    ],
  },
  sad: {
    emotionTag: "sad",
    intensity: 0.7,
    parts: [
      "eye-tear",
      "brow-sad",
      "mouth-sad",
      "blush-pale",
      "whiskers-droopy",
      "tail-droopy",
      "arm-fold",
      "body-shrink",
      "head-bow",
      "tea-cup-float",
      "legs-cross",
      "ui-flicker",
      "frills-wave",
    ],
  },
  surprised: {
    emotionTag: "surprised",
    intensity: 0.85,
    parts: [
      "eye-wide-open",
      "brow-surprised",
      "mouth-open-surprised",
      "blush-intense",
      "whiskers-twitch",
      "tail-bristle",
      "arm-wave",
      "body-shake-intense",
      "headpiece-fly",
      "tray-shake",
      "legs-jump",
      "ui-spin",
      "waist-bow-bounce",
    ],
  },
  disgust: {
    emotionTag: "disgust",
    intensity: 0.75,
    parts: [
      "eye-half-open",
      "brow-worry",
      "mouth-pout",
      "blush-pale",
      "whiskers-droopy",
      "tail-droopy",
      "paw-tremble",
      "body-sway",
      "head-tilt",
      "tray-tilt",
      "legs-tremble",
      "ui-flicker",
      "frills-spin",
    ],
  },
  fear: {
    emotionTag: "fear",
    intensity: 0.8,
    parts: [
      "eye-wide-open",
      "brow-worry",
      "mouth-tremble",
      "blush-pale",
      "whiskers-shake",
      "tail-bristle",
      "arm-fold",
      "body-shrink",
      "headpiece-shake",
      "tray-shake",
      "legs-tremble",
      "ui-flicker",
      "waist-bow-flutter",
    ],
  },
  love: {
    emotionTag: "love",
    intensity: 0.85,
    parts: [
      "eye-heart",
      "brow-happy",
      "mouth-smile",
      "blush-hearts",
      "whiskers-twitch",
      "tail-heart",
      "arm-hands-up",
      "body-breathe",
      "head-nod",
      "tea-cup-float",
      "legs-cross",
      "ui-pulse",
      "waist-bow-bounce",
    ],
  },
  neutral: {
    emotionTag: "neutral",
    intensity: 0.3,
    parts: [
      "eye-blink",
      "brow-flat",
      "mouth-smile",
      "blush-hide",
      "tail-wag-slow",
      "body-breathe",
      "head-tilt",
    ],
  },
  excited: {
    emotionTag: "excited",
    intensity: 0.9,
    parts: [
      "eye-sparkle",
      "brow-happy",
      "mouth-big-smile",
      "blush-intense",
      "whiskers-twitch",
      "tail-wag-fast",
      "arm-hands-up",
      "body-bounce-gentle",
      "headpiece-fly",
      "cupcake-bounce",
      "legs-jump",
      "ui-sparkle-explode",
      "waist-bow-bounce",
    ],
  },
  confused: {
    emotionTag: "confused",
    intensity: 0.6,
    parts: [
      "eye-dizzy",
      "brow-confused",
      "mouth-nervous",
      "blush-pale",
      "whiskers-twitch",
      "tail-wag-slow",
      "paw-tremble",
      "body-sway",
      "head-tilt",
      "tray-tilt",
      "legs-cross",
      "ui-spin",
      "frills-wave",
    ],
  },
  shy: {
    emotionTag: "shy",
    intensity: 0.7,
    parts: [
      "eye-half-open",
      "brow-worry",
      "mouth-pout",
      "blush-intense",
      "whiskers-droopy",
      "tail-droopy",
      "arm-fold",
      "body-shrink",
      "head-bow",
      "tea-cup-float",
      "legs-cross",
      "ui-pulse",
      "waist-bow-flutter",
    ],
  },
  cool: {
    emotionTag: "cool",
    intensity: 0.6,
    parts: [
      "eye-glare",
      "brow-determined",
      "mouth-smirk",
      "blush-hide",
      "whiskers-flare",
      "tail-wag-slow",
      "arm-fold",
      "body-breathe",
      "head-nod",
      "tray-tilt",
      "legs-cross",
      "ui-spin",
      "frills-spin",
    ],
  },
  mischievous: {
    emotionTag: "mischievous",
    intensity: 0.75,
    parts: [
      "eye-glow",
      "brow-happy",
      "mouth-smirk",
      "blush-hearts",
      "whiskers-twitch",
      "tail-heart",
      "paw-reach",
      "body-sway",
      "head-tilt",
      "cupcake-bounce",
      "legs-kick",
      "ui-glitch",
      "waist-bow-bounce",
    ],
  },
  tired: {
    emotionTag: "tired",
    intensity: 0.5,
    parts: [
      "eye-sleepy",
      "brow-flat",
      "mouth-drool",
      "blush-pale",
      "whiskers-droopy",
      "tail-droopy",
      "arm-fold",
      "body-shrink",
      "head-bow",
      "tray-tilt",
      "legs-cross",
      "ui-flicker",
      "frills-wave",
    ],
  },
  determined: {
    emotionTag: "determined",
    intensity: 0.85,
    parts: [
      "eye-angry-glow",
      "brow-determined",
      "mouth-grit",
      "blush-hide",
      "whiskers-flare",
      "tail-bristle",
      "arm-fist",
      "body-breathe",
      "head-nod",
      "tray-shake",
      "legs-tremble",
      "ui-pulse",
      "waist-bow-flutter",
    ],
  },
}

/** Convert emotion tag to CSS class string for MaidCatAvatar */
export function getMaidCatExpressionClasses(emotionTag: string): string {
  const preset = maidCatExpressionPresets[emotionTag] ?? maidCatExpressionPresets.neutral
  return preset.parts.map((part) => `mc-${part}`).join(" ")
}

/** Get expression metadata for debug display */
export function getExpressionMeta(emotionTag: string): { parts: number; intensity: number } {
  const preset = maidCatExpressionPresets[emotionTag] ?? maidCatExpressionPresets.neutral
  return { parts: preset.parts.length, intensity: preset.intensity }
}
