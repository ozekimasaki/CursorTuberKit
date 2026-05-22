import { useEffect, useMemo, useRef, type CSSProperties, type ForwardedRef } from "react"
import { type AvatarState } from "./MaidCatAvatar"
import { SvgAvatar } from "./SvgAvatar"
import { MotionPngAvatar, type MotionPngAvatarHandle } from "./MotionPngAvatar"
import { ViewerEventFeed } from "./ViewerEventFeed"
import type { Emotion } from "../../shared/emotion"
import type { SinExpressionSignal } from "../../shared/sinsExpression"
import type { AvatarMode, MotionPngAssetStatus, MotionPngSettings, SvgAvatarSettings, SvgCharacterId } from "../lib/avatarConfig"
import type { Viseme } from "../lib/visemes"
import type { PlatformViewerEvent } from "../../shared/platformChat"
import { defaultStageCaptionStyle, type StageCaptionStyle } from "../lib/stagePreferences"
import { useCaptionFont } from "../lib/googleFonts"

type StageBackground =
  | { kind: "image"; url: string; name: string }
  | { kind: "video"; url: string; name: string }
  | { kind: "preset"; id: string; name: string; css: string }
  | null

type StageViewProps = {
  avatarMode: AvatarMode
  avatarState: AvatarState
  caption: string
  showCaption: boolean
  captionStyle?: StageCaptionStyle
  showComments: boolean
  liveViewerEvents: PlatformViewerEvent[]
  emotion: Emotion
  motionPngAvatarRef?: ForwardedRef<MotionPngAvatarHandle>
  motionPngFiles: File[]
  motionPngSettings: MotionPngSettings
  svgAvatarSettings: SvgAvatarSettings
  svgCharacter: SvgCharacterId
  sinSignal?: SinExpressionSignal
  onMotionPngAssetStatusChange?: (status: MotionPngAssetStatus) => void
  stageBackgroundMedia: StageBackground
  viseme: Viseme
  embedded?: boolean
}

export function StageView({
  avatarMode,
  avatarState,
  caption,
  showCaption,
  captionStyle = defaultStageCaptionStyle,
  showComments,
  liveViewerEvents,
  emotion,
  motionPngAvatarRef,
  motionPngFiles,
  motionPngSettings,
  svgAvatarSettings,
  svgCharacter,
  sinSignal,
  onMotionPngAssetStatusChange,
  stageBackgroundMedia,
  viseme,
  embedded = false,
}: StageViewProps) {
  useEffect(() => {
    if (embedded) return
    document.body.classList.add("stage-mode")
    return () => {
      document.body.classList.remove("stage-mode")
    }
  }, [embedded])

  const scalerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = scalerRef.current
    if (!el) return
    const parent = el.parentElement
    if (!parent) return
    const STAGE_REF_SIZE = 720
    const apply = () => {
      const rect = parent.getBoundingClientRect()
      if (rect.height > 0) {
        el.style.setProperty("--stage-avatar-scale", String(rect.height / STAGE_REF_SIZE))
      }
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [avatarMode])

  const captionFont = useCaptionFont(captionStyle.fontId)
  const captionStyleVars = useMemo<CSSProperties>(() => {
    const bg = Math.max(0, Math.min(1, captionStyle.backgroundOpacity))
    const outline = captionStyle.outlineEnabled
      ? "0 0 4px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.95), 1px 0 0 rgba(0,0,0,0.9), -1px 0 0 rgba(0,0,0,0.9), 0 1px 0 rgba(0,0,0,0.9), 0 -1px 0 rgba(0,0,0,0.9)"
      : "none"
    return {
      "--stage-caption-font-family": captionFont.stack,
      "--stage-caption-font-weight": String(captionStyle.fontWeight),
      "--stage-caption-font-scale": String(captionStyle.fontSizeScale),
      "--stage-caption-color": captionStyle.color,
      "--stage-caption-bg": `rgba(0, 0, 0, ${bg})`,
      "--stage-caption-shadow": outline,
    } as CSSProperties
  }, [captionFont, captionStyle])

  return (
    <main
      className={`stage-view${embedded ? " stage-view--embedded" : ""}`}
      aria-label="配信用ステージ"
    >
      {stageBackgroundMedia?.kind === "image" && (
        <img
          aria-hidden="true"
          alt=""
          className="stage-view__background"
          src={stageBackgroundMedia.url}
        />
      )}
      {stageBackgroundMedia?.kind === "video" && (
        <video
          aria-hidden="true"
          autoPlay
          className="stage-view__background stage-view__background--video"
          loop
          muted
          playsInline
          src={stageBackgroundMedia.url}
        />
      )}
      {stageBackgroundMedia?.kind === "preset" && (
        <div
          aria-hidden="true"
          className="stage-view__background stage-view__background--preset"
          style={{ background: stageBackgroundMedia.css }}
        />
      )}

      <div className="stage-view__avatar">
        <div className="stage-view__avatar-frame">
          <div className="stage-view__avatar-scaler" ref={scalerRef}>
            {avatarMode === "motionpng" ? (
              <MotionPngAvatar
                assetFiles={motionPngFiles}
                onAssetStatusChange={onMotionPngAssetStatusChange ?? (() => undefined)}
                ref={motionPngAvatarRef}
                settings={motionPngSettings}
                state={avatarState}
              />
            ) : (
              <div
                className="stage-view__svg-transform"
                style={{
                  transform: `translate(calc(${svgAvatarSettings.offsetX}px * var(--stage-avatar-scale, 1)), calc(${svgAvatarSettings.offsetY}px * var(--stage-avatar-scale, 1))) scale(${svgAvatarSettings.scale})`,
                } as CSSProperties}
              >
                <SvgAvatar
                  character={svgCharacter}
                  emotion={emotion}
                  hideBackgroundDecor={Boolean(stageBackgroundMedia)}
                  state={avatarState}
                  viseme={viseme}
                  sinSignal={sinSignal}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {showComments && (
        <aside className="stage-view__comments" aria-label="ライブコメント">
          <ViewerEventFeed events={liveViewerEvents} />
        </aside>
      )}

      {showCaption && (
        <div
          className={`stage-view__caption${caption ? "" : " stage-view__caption--empty"}`}
          aria-live="polite"
          style={captionStyleVars}
        >
          {caption}
        </div>
      )}
    </main>
  )
}
