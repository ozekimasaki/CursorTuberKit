import { useEffect, useMemo, useRef } from "react"
import type { DopamineState } from "../../shared/dopamineMutation"

/**
 * Renders dopamine visual effects as CSS variable overrides.
 *
 * - Glitch: clip-path + filter animation during morphing
 * - Hue shift: background filter during morphed state
 * - Glow: box-shadow on the stage frame during morphed state
 */
export type DopamineEffectsProps = {
  state: DopamineState
  children: React.ReactNode
}

export function DopamineEffects({ state, children }: DopamineEffectsProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { visual, phase } = state

  const styleVars = useMemo(() => {
    const bg = `hue-rotate(${visual.backgroundHueShift}deg) saturate(${visual.backgroundSatMul})`
    return {
      "--dopamine-bg-filter": bg,
      "--dopamine-caption-color": visual.captionColor ?? "",
      "--dopamine-caption-weight": String(visual.captionWeight),
      "--dopamine-caption-size-mul": String(visual.captionSizeMul),
      "--dopamine-glitch-intensity": String(visual.glitchIntensity),
      "--dopamine-shake-intensity": String(visual.shakeIntensity),
      "--dopamine-glow-color": visual.frameGlowColor ?? "transparent",
    } as React.CSSProperties
  }, [visual])

  // Apply glitch class during morphing
  const isGlitching = phase === "morphing" || phase === "triggered"
  const isShaking = visual.shakeIntensity > 0.3

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    if (isGlitching) {
      el.classList.add("dopamine-glitching")
    } else {
      el.classList.remove("dopamine-glitching")
    }

    if (isShaking) {
      el.classList.add("dopamine-shaking")
    } else {
      el.classList.remove("dopamine-shaking")
    }
  }, [isGlitching, isShaking])

  return (
    <div
      ref={containerRef}
      className="dopamine-effects"
      style={styleVars}
      aria-hidden="true"
    >
      {/* Background hue overlay */}
      {(phase === "morphed" || phase === "morphing") && (
        <div
          className="dopamine-effects__bg-overlay"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 5,
            backdropFilter: `var(--dopamine-bg-filter)`,
            WebkitBackdropFilter: `var(--dopamine-bg-filter)`,
            opacity: 0.25,
            transition: "opacity 0.3s ease",
          }}
        />
      )}

      {/* Frame glow */}
      {visual.frameGlowColor && (
        <div
          className="dopamine-effects__glow"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 6,
            boxShadow: `inset 0 0 60px 20px var(--dopamine-glow-color)`,
            opacity: 0.6,
            transition: "opacity 0.5s ease",
          }}
        />
      )}

      {/* Glitch layers */}
      {isGlitching && (
        <>
          <div
            className="dopamine-effects__glitch-layer dopamine-effects__glitch-layer--r"
            aria-hidden="true"
          />
          <div
            className="dopamine-effects__glitch-layer dopamine-effects__glitch-layer--g"
            aria-hidden="true"
          />
          <div
            className="dopamine-effects__glitch-layer dopamine-effects__glitch-layer--b"
            aria-hidden="true"
          />
        </>
      )}

      {children}
    </div>
  )
}
