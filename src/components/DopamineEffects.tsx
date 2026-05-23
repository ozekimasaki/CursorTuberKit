import { useEffect, useMemo, useRef, useState } from "react"
import type { DopamineState } from "../../shared/dopamineMutation"

const GLITCH_VARIANTS = [
  "dopamine-invert-flash",
  "dopamine-scale-jump",
  "dopamine-blur-pulse",
  "dopamine-slice-shift",
  "dopamine-chromatic-warp",
  "dopamine-scanline-flicker",
  "dopamine-matrix-rain",
  "dopamine-frame-drop",
  "dopamine-data-moshing",
  "dopamine-shake",
]

function pickGlitchVariants(count: number): string[] {
  const shuffled = [...GLITCH_VARIANTS].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

export type DopamineEffectsProps = {
  state: DopamineState
  children: React.ReactNode
}

export function DopamineEffects({ state, children }: DopamineEffectsProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const effectsRef = useRef<HTMLDivElement>(null)
  const { visual, phase, activeCue } = state
  const [glitchClasses, setGlitchClasses] = useState<string[]>([])
  const [shakeActive, setShakeActive] = useState(false)
  const prevCueRef = useRef<string | undefined>(undefined)

  const isGlitching = phase === "morphing" || phase === "triggered"
  const isShaking = visual.shakeIntensity > 0.3

  // Trigger random glitches on new cue
  useEffect(() => {
    const cueId = activeCue?.receivedAt
    if (cueId && cueId !== prevCueRef.current) {
      prevCueRef.current = cueId
      // 80% chance of 2 glitches, 40% chance of 3
      const variantCount = Math.random() < 0.4 ? 3 : Math.random() < 0.8 ? 2 : 1
      const variants = pickGlitchVariants(variantCount)
      setGlitchClasses(variants)
      setShakeActive(true)

      // Duration: 1.5s ~ 3.0s based on intensity
      const duration = 1500 + (visual.glitchIntensity ?? 0.5) * 1500
      const timer = setTimeout(() => {
        setGlitchClasses([])
        setShakeActive(false)
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [activeCue, visual.glitchIntensity])

  const styleVars = useMemo(() => {
    return {
      "--dopamine-caption-color": visual.captionColor ?? "",
      "--dopamine-caption-weight": String(visual.captionWeight),
      "--dopamine-caption-size-mul": String(visual.captionSizeMul),
      "--dopamine-shake-intensity": String(visual.shakeIntensity),
      "--dopamine-glow-color": visual.frameGlowColor ?? "transparent",
    } as React.CSSProperties
  }, [visual])

  return (
    <div
      ref={containerRef}
      className="dopamine-effects"
      style={styleVars}
    >
      {/* Visual effects layer (glitches apply here, NOT on children) */}
      <div
        ref={effectsRef}
        className={[
          "dopamine-effects__layer",
          isGlitching ? "dopamine-glitching" : "",
          shakeActive || isShaking ? "dopamine-shaking" : "",
          ...glitchClasses,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 5,
        }}
        aria-hidden="true"
      >
        {/* Frame glow */}
        {visual.frameGlowColor && (
          <div
            className="dopamine-effects__glow"
            style={{
              position: "absolute",
              inset: 0,
              boxShadow: `inset 0 0 60px 20px var(--dopamine-glow-color)`,
              opacity: 0.6,
              transition: "opacity 0.5s ease",
            }}
          />
        )}
      </div>

      {/* Protected content layer (captions, comments, avatar) - NO glitches */}
      <div
        className="dopamine-effects__content"
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          height: "100%",
        }}
      >
        {children}
      </div>
    </div>
  )
}
