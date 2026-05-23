import { MaidCatAvatar, type AvatarState } from "./MaidCatAvatar"
import { CatlinV2Avatar } from "./CatlinV2Avatar"
import type { Emotion } from "../../shared/emotion"
import type { SinExpressionSignal } from "../../shared/sinsExpression"
import type { SvgCharacterId } from "../lib/avatarConfig"
import type { Viseme } from "../lib/visemes"

type SvgAvatarProps = {
  character: SvgCharacterId
  emotion?: Emotion
  hideBackgroundDecor?: boolean
  state: AvatarState
  viseme?: Viseme
  sinSignal?: SinExpressionSignal
  expressionClasses?: string
}

export function SvgAvatar({ character, expressionClasses, ...rest }: SvgAvatarProps) {
  if (character === "catlin_v2") {
    return <CatlinV2Avatar {...rest} />
  }
  return <MaidCatAvatar {...rest} expressionClasses={expressionClasses} />
}
