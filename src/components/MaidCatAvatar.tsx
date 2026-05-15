import maidCatSvg from "../../maid_cat.svg?raw"
import type { Emotion } from "../../shared/emotion"
import type { Viseme } from "../lib/visemes"

export type AvatarState = "idle" | "thinking" | "speaking" | "error"

type MaidCatAvatarProps = {
  emotion?: Emotion
  state: AvatarState
  viseme?: Viseme
}

export function MaidCatAvatar({ state, viseme, emotion = "neutral" }: MaidCatAvatarProps) {
  const emotionClass = ` avatar--emotion-${emotion}`
  const visemeClass = viseme ? ` avatar--viseme-${viseme}` : ""

  return (
    <div
      aria-label={`メイド猫アバター: ${state}`}
      className={`avatar avatar--${state}${emotionClass}${visemeClass}`}
      dangerouslySetInnerHTML={{ __html: maidCatSvg }}
      role="img"
    />
  )
}
