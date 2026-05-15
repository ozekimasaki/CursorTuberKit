import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from "react"
import type { MotionPngAssetStatus, MotionPngAudioAnalysis, MotionPngSettings } from "../lib/avatarConfig"
import { MotionPngEngine } from "../lib/motionPngEngine"
import type { AvatarState } from "./MaidCatAvatar"

type MotionPngAvatarProps = {
  assetFiles: File[]
  onAssetStatusChange: (status: MotionPngAssetStatus) => void
  settings: MotionPngSettings
  state: AvatarState
}

export type MotionPngAvatarHandle = {
  processAudioData: (data: MotionPngAudioAnalysis) => void
  resetAudio: () => void
}

export const MotionPngAvatar = forwardRef<MotionPngAvatarHandle, MotionPngAvatarProps>(function MotionPngAvatar(
  { assetFiles, onAssetStatusChange, settings, state },
  ref,
) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const mouthCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<MotionPngEngine | null>(null)
  const statusCallbackRef = useRef(onAssetStatusChange)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    statusCallbackRef.current = onAssetStatusChange
  }, [onAssetStatusChange])

  useImperativeHandle(
    ref,
    () => ({
      processAudioData(data) {
        engineRef.current?.processAudioData(data)
      },
      resetAudio() {
        engineRef.current?.resetAudioStats()
      },
    }),
    [],
  )

  useEffect(() => {
    const stage = stageRef.current
    const video = videoRef.current
    const videoCanvas = videoCanvasRef.current
    const mouthCanvas = mouthCanvasRef.current

    if (!stage || !video || !videoCanvas || !mouthCanvas) {
      return
    }

    const engine = new MotionPngEngine({
      callbacks: {
        onError: (message) => {
          setReady(false)
          statusCallbackRef.current({
            loaded: false,
            message,
            tone: "error",
          })
        },
        onFileStatus: (tone, message) => {
          const loaded = tone === "success"
          setReady(loaded)
          statusCallbackRef.current({
            loaded,
            message,
            tone,
          })
        },
      },
      elements: {
        mouthCanvas,
        stage,
        video,
        videoCanvas,
      },
      options: settings,
    })

    engineRef.current = engine

    return () => {
      engine.destroy()
      engineRef.current = null
      setReady(false)
    }
  }, [])

  useEffect(() => {
    engineRef.current?.updateSettings(settings)
  }, [settings])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) {
      return
    }

    if (assetFiles.length === 0) {
      engine.cleanup()
      setReady(false)
      statusCallbackRef.current({
        loaded: false,
        message: null,
        tone: null,
      })
      return
    }

    let cancelled = false
    statusCallbackRef.current({
      loaded: false,
      message: "MotionPNGTuber アセットを読み込んでいます。",
      tone: "loading",
    })

    void engine
      .loadFiles(assetFiles)
      .then(async (loaded) => {
        if (cancelled || !loaded) {
          return
        }
        await engine.start()
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        statusCallbackRef.current({
          loaded: false,
          message: error instanceof Error ? error.message : "MotionPNGTuber アセットの初期化に失敗しました。",
          tone: "error",
        })
      })

    return () => {
      cancelled = true
      engine.stop()
      engine.resetAudioStats()
    }
  }, [assetFiles])

  const transformStyle: CSSProperties = {
    transform: `translate(${settings.offsetX}px, ${settings.offsetY}px) scale(${settings.scale})`,
  }

  return (
    <div aria-label={`MotionPNGTuber アバター: ${state}`} className={`avatar avatar--motionpng avatar--${state}`} role="img">
      <div className="motionpng-avatar__transform" style={transformStyle}>
        <div className={`motionpng-stage${ready ? " motionpng-stage--ready" : ""}`} ref={stageRef}>
          <video className="motionpng-stage__source" ref={videoRef} />
          <canvas className="motionpng-stage__video" ref={videoCanvasRef} />
          <canvas className="motionpng-stage__mouth" ref={mouthCanvasRef} />
          {!ready && (
            <div className="motionpng-stage__placeholder">
              {assetFiles.length > 0 ? "MotionPNGTuber アセットを読み込んでいます。" : "MotionPNGTuber のフォルダを選択してください。"}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
