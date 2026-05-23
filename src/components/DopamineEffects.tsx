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

  const director = state.lastDirectorDecision
  const [showDebug, setShowDebug] = useState(false)

  // Show debug panel briefly when AI makes a decision
  useEffect(() => {
    if (director) {
      setShowDebug(true)
      const timer = setTimeout(() => setShowDebug(false), 6000)
      return () => clearTimeout(timer)
    }
  }, [director])

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

      {/* AI Director debug overlay - confirms AI is actually running */}
      {showDebug && director && (
        <div
          style={{
            position: "fixed",
            top: 8,
            left: 8,
            zIndex: 9998,
            background: "rgba(0,0,0,0.85)",
            color: "#0f0",
            fontFamily: "monospace",
            fontSize: 11,
            padding: "6px 10px",
            borderRadius: 4,
            border: "1px solid #0f0",
            maxWidth: 280,
            pointerEvents: "none",
            backdropFilter: "blur(4px)",
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: 4, color: "#0ff" }}>
            🧠 AI DIRECTOR ACTIVE
          </div>
          <div>Emotion: {director.emotionTag}</div>
          <div>Intensity: {(director.intensity * 100).toFixed(0)}%</div>
          <div>Visual: ×{director.visualMultiplier.toFixed(2)}</div>
          <div>Voice: ×{director.voiceMultiplier.toFixed(2)}</div>
          <div>Glitch: [{director.glitchTypes.slice(0, 4).join(",")}]</div>
          <div style={{ marginTop: 4, color: "#aaa", fontSize: 10 }}>
            {director.reasoning}
          </div>
          <div style={{ marginTop: 2, color: "#666", fontSize: 9 }}>
            {state.activeCue?.meta?.reasoning ?? ""}
          </div>
        </div>
      )}

      {/* Prompt Mutation History Log */}
      {state.personaHistory.length > 0 && (
        <div
          style={{
            position: "fixed",
            top: 8,
            right: 8,
            zIndex: 9997,
            background: "rgba(0,0,0,0.85)",
            color: "#ff8",
            fontFamily: "monospace",
            fontSize: 10,
            padding: "6px 10px",
            borderRadius: 4,
            border: "1px solid #ff8",
            maxWidth: 260,
            maxHeight: 200,
            overflowY: "auto",
            pointerEvents: "none",
            backdropFilter: "blur(4px)",
            lineHeight: 1.4,
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: 4, color: "#ff8" }}>
            🔄 PROMPT MUTATIONS ({state.personaHistory.length})
          </div>
          {state.personaHistory.slice(0, 5).map((m, i) => (
            <div key={m.id} style={{ marginBottom: 4, opacity: i === 0 ? 1 : 0.6 }}>
              <div style={{ color: i === 0 ? "#ff8" : "#aa8", fontWeight: i === 0 ? "bold" : "normal" }}>
                {i === 0 ? "●" : "○"} {m.summary}
              </div>
              <div style={{ color: "#888", fontSize: 9 }}>
                {m.cue.kind} | {m.cue.emotionTag || "neutral"}
              </div>
              {i === 0 && m.monologue && (
                <div style={{ color: "#afa", fontSize: 9, marginTop: 2 }}>
                  "{m.monologue.substring(0, 40)}..."
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
