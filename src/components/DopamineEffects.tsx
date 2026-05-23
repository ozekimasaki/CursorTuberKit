import { useEffect, useMemo, useRef, useState } from "react"
import type { DopamineState, GeneratedEffect } from "../../shared/dopamineMutation"

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
  "dopamine-hue-spin",
  "dopamine-skew-warp",
  "dopamine-rotate-spin",
  "dopamine-saturate-flash",
  "dopamine-ghost-trail",
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
  const [generatedEffects, setGeneratedEffects] = useState<GeneratedEffect[]>([])

  const isGlitching = phase === "morphing" || phase === "triggered"
  const isShaking = visual.shakeIntensity > 0.3

  // Poll generated effects periodically
  useEffect(() => {
    let mounted = true
    const fetchEffects = async () => {
      try {
        const res = await fetch("/api/dopamine/effects")
        if (res.ok && mounted) {
          const data = (await res.json()) as { effects: GeneratedEffect[] }
          setGeneratedEffects(data.effects)
        }
      } catch {
        // ignore
      }
    }
    fetchEffects()
    const interval = setInterval(fetchEffects, 5000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [activeCue?.receivedAt])

  // Inject generated CSS
  useEffect(() => {
    const styleId = "dopamine-generated-effects"
    let styleTag = document.getElementById(styleId) as HTMLStyleElement | null
    if (!styleTag) {
      styleTag = document.createElement("style")
      styleTag.id = styleId
      document.head.appendChild(styleTag)
    }
    styleTag.textContent = generatedEffects.map((e) => `${e.cssKeyframes}\n${e.cssClass}`).join("\n\n")
  }, [generatedEffects])

  // Trigger MASSIVE glitches on EVERY comment - use AI director glitch types if available
  useEffect(() => {
    const cueId = activeCue?.receivedAt
    if (cueId && cueId !== prevCueRef.current) {
      prevCueRef.current = cueId
      const aiGlitchTypes = activeCue?.meta?.glitchTypes
      let variants: string[]

      if (aiGlitchTypes && aiGlitchTypes.length > 0) {
        // AI selected glitches
        const mapped = aiGlitchTypes
          .map((g) => `dopamine-${g}`)
          .filter((g) => GLITCH_VARIANTS.includes(g))
        variants = mapped.length > 0 ? mapped : pickGlitchVariants(4)
      } else {
        const roll = Math.random()
        const variantCount = roll < 0.4 ? 5 : roll < 0.7 ? 4 : roll < 0.9 ? 3 : 2
        variants = pickGlitchVariants(variantCount)
      }

      setGlitchClasses(variants)
      setShakeActive(true)

      // Duration: 2.0s ~ 5.0s based on intensity
      const duration = 2000 + (visual.glitchIntensity ?? 0.5) * 3000
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
