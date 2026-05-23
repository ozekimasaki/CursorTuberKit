import maidCatSvg from "../../maid_cat.svg?raw"
import type { Emotion } from "../../shared/emotion"
import type { SinExpressionSignal } from "../../shared/sinsExpression"
import type { Viseme } from "../lib/visemes"

export type AvatarState = "idle" | "thinking" | "speaking" | "error"

type MaidCatAvatarProps = {
  emotion?: Emotion
  hideBackgroundDecor?: boolean
  state: AvatarState
  viseme?: Viseme
  // Accepted for symmetry with CatlinV2Avatar; not yet consumed.
  sinSignal?: SinExpressionSignal
  /** CSS classes for SVG part animations */
  expressionClasses?: string
}

export function MaidCatAvatar({ state, viseme, emotion = "neutral", hideBackgroundDecor = false, expressionClasses = "" }: MaidCatAvatarProps) {
  const emotionClass = ` avatar--emotion-${emotion}`
  const visemeClass = viseme ? ` avatar--viseme-${viseme}` : ""
  const backgroundClass = hideBackgroundDecor ? " avatar--clean-background" : ""

  return (
    <div
      aria-label={`メイド猫アバター: ${state}`}
      className={`avatar avatar--${state}${emotionClass}${visemeClass}${backgroundClass} ${expressionClasses}`}
      dangerouslySetInnerHTML={{ __html: maidCatSvg }}
      role="img"
    />
  )
}
