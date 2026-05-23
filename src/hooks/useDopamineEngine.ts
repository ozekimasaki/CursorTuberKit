import { useCallback, useRef, useState, useEffect } from "react"
import type {
  DirectorDecision,
  DopamineState,
  MutationCue,
  PersonaMutation,
  VisualMutationParams,
  VoiceMutationParams,
} from "../../shared/dopamineMutation"
import {
  buildCommentCue,
  createDefaultDopamineState,
  cueToVisualParams,
  cueToVoiceParams,
  DEFAULT_VISUAL_MUTATION,
} from "../../shared/dopamineMutation"
import type { PlatformViewerEvent } from "../../shared/platformChat"

const MORPH_INTERVAL_MS = 100
const HEAVY_MUTATION_COOLDOWN_MS = 60_000
const CHAIN_REACTION_CHANCE = 0.2

export type DopamineEngine = {
  state: DopamineState
  triggerCueFromComment: (event: PlatformViewerEvent) => Promise<void>
  triggerManualCue: (emotionTag?: string) => void
  pushPersonaMutation: (mutation: PersonaMutation) => void
  undoLastMutation: () => void
  isHeavyMutationReady: () => boolean
  setLiveMutationBusy: (busy: boolean) => void
}

export function useDopamineEngine(): DopamineEngine {
  const [state, setState] = useState<DopamineState>(createDefaultDopamineState())
  const stateRef = useRef<DopamineState>(state)
  const morphTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const stopMorphTimer = useCallback(() => {
    if (morphTimerRef.current) {
      clearInterval(morphTimerRef.current)
      morphTimerRef.current = null
    }
  }, [])

  const lerpVisual = useCallback(
    (current: VisualMutationParams, target: VisualMutationParams, t: number): VisualMutationParams => {
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t
      return {
        backgroundHueShift: lerp(current.backgroundHueShift, target.backgroundHueShift, t),
        backgroundSatMul: lerp(current.backgroundSatMul, target.backgroundSatMul, t),
        captionColor: t > 0.5 ? target.captionColor : current.captionColor,
        captionWeight: lerp(current.captionWeight, target.captionWeight, t),
        captionSizeMul: lerp(current.captionSizeMul, target.captionSizeMul, t),
        glitchIntensity: lerp(current.glitchIntensity, target.glitchIntensity, t),
        shakeIntensity: lerp(current.shakeIntensity, target.shakeIntensity, t),
        frameGlowColor: t > 0.5 ? target.frameGlowColor : current.frameGlowColor,
        morphDurationMs: target.morphDurationMs,
        backgroundPresetId: t > 0.5 ? target.backgroundPresetId : current.backgroundPresetId,
      }
    },
    [],
  )

  const startMorphing = useCallback(
    (targetVisual: VisualMutationParams, durationMs: number) => {
      stopMorphTimer()
      const start = performance.now()
      const from = stateRef.current.visual

      morphTimerRef.current = setInterval(() => {
        const elapsed = performance.now() - start
        const progress = Math.min(1, elapsed / durationMs)
        // ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3)

        setState((prev) => {
          const nextVisual = lerpVisual(from, targetVisual, eased)
          return {
            ...prev,
            visual: nextVisual,
            phase: progress >= 1 ? "morphed" : "morphing",
          }
        })

        if (progress >= 1) {
          stopMorphTimer()
        }
      }, MORPH_INTERVAL_MS)
    },
    [stopMorphTimer, lerpVisual],
  )

  const triggerCue = useCallback(
    (cue: MutationCue, decision?: DirectorDecision) => {
      const targetVisual = cueToVisualParams(cue)
      const voice = cueToVoiceParams(cue)

      setState((prev) => {
        const next: DopamineState = {
          ...prev,
          phase: "triggered",
          targetVisual,
          voice,
          activeCue: cue,
          lastDirectorDecision: decision ?? prev.lastDirectorDecision,
        }
        return next
      })

      // Start the visual morph animation
      startMorphing(targetVisual, targetVisual.morphDurationMs)

      // Random chain reaction (higher chance with AI director)
      if (Math.random() < CHAIN_REACTION_CHANCE) {
        setTimeout(() => {
          const chainCue: MutationCue = {
            kind: "chain_reaction",
            intensity: 0.85,
            receivedAt: new Date().toISOString(),
          }
          triggerCue(chainCue)
        }, targetVisual.morphDurationMs + 400)
      }
    },
    [startMorphing],
  )

  const triggerCueFromComment = useCallback(
    async (event: PlatformViewerEvent) => {
      if (event.kind !== "comment" || !event.text) return
      const cue = buildCommentCue(event.text, event.receivedAt)
      console.log(`[DopamineEngine] Comment received: "${event.text.substring(0, 40)}" → local emotion=${cue.emotionTag}`)

      // Fire-and-forget agent voting for telemetry / future use
      try {
        fetch("/api/dopamine/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commentText: event.text,
            currentEmotion: cue.emotionTag || "neutral",
          }),
        }).catch(() => undefined)
      } catch {
        // ignore
      }

      // Try AI director first
      try {
        console.log(`[DopamineEngine] Calling AI director...`)
        const res = await fetch("/api/dopamine/direct", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commentText: event.text,
            currentEmotion: cue.emotionTag || "neutral",
            recentComments: [],
          }),
        })
        if (res.ok) {
          const data = (await res.json()) as {
            decision: DirectorDecision
            cue: MutationCue
          }
          console.log(`[DopamineEngine] AI director responded: emotion=${data.decision.emotionTag}, intensity=${data.decision.intensity}, vm=${data.decision.visualMultiplier}, glitch=[${data.decision.glitchTypes.join(",")}]`)
          const mergedCue: MutationCue = {
            ...data.cue,
            meta: {
              glitchTypes: data.decision.glitchTypes,
              visualMultiplier: data.decision.visualMultiplier,
              voiceMultiplier: data.decision.voiceMultiplier,
              reasoning: data.decision.reasoning,
            },
          }
          triggerCue(mergedCue, data.decision)

          // If director says generate a new effect, fire-and-forget
          if (data.decision.shouldMutant) {
            try {
              fetch("/api/dopamine/mutant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requestText: event.text }),
              }).catch(() => undefined)
            } catch {
              // ignore
            }
          }
          return
        }
        console.warn(`[DopamineEngine] AI director returned status ${res.status}, falling back to local`)
      } catch (err) {
        console.error(`[DopamineEngine] AI director failed: ${err instanceof Error ? err.message : String(err)}, falling back to local`)
      }

      console.log(`[DopamineEngine] Using LOCAL fallback for: "${event.text.substring(0, 40)}"`)
      triggerCue(cue)
    },
    [triggerCue],
  )

  const triggerManualCue = useCallback(
    (emotionTag?: string) => {
      const cue: MutationCue = {
        kind: "manual",
        emotionTag: emotionTag || "neutral",
        intensity: 0.7,
        receivedAt: new Date().toISOString(),
      }
      triggerCue(cue)
    },
    [triggerCue],
  )

  const pushPersonaMutation = useCallback((mutation: PersonaMutation) => {
    setState((prev) => ({
      ...prev,
      personaHistory: [mutation, ...prev.personaHistory].slice(0, 10),
      heavyCooldownUntil: Date.now() + HEAVY_MUTATION_COOLDOWN_MS,
    }))
  }, [])

  const undoLastMutation = useCallback(() => {
    setState((prev) => {
      if (prev.personaHistory.length === 0) return prev
      const [, ...rest] = prev.personaHistory
      const last = prev.personaHistory[0]
      if (!last) return prev
      return {
        ...prev,
        personaHistory: rest,
        visual: { ...DEFAULT_VISUAL_MUTATION },
        targetVisual: { ...DEFAULT_VISUAL_MUTATION },
        voice: { speedDelta: 0, pitchDelta: 0, intonationDelta: 0, speakerId: null },
        phase: "reverting",
        activeCue: null,
      }
    })
  }, [])

  const isHeavyMutationReady = useCallback(() => {
    return Date.now() >= stateRef.current.heavyCooldownUntil
  }, [])

  const setLiveMutationBusy = useCallback((busy: boolean) => {
    setState((prev) => ({
      ...prev,
      phase: busy ? "morphing" : prev.phase,
    }))
  }, [])

  useEffect(() => {
    return () => {
      stopMorphTimer()
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current)
    }
  }, [stopMorphTimer])

  return {
    state,
    triggerCueFromComment,
    triggerManualCue,
    pushPersonaMutation,
    undoLastMutation,
    isHeavyMutationReady,
    setLiveMutationBusy,
  }
}
