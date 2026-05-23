import { useCallback, useRef, useState, useEffect } from "react"
import type {
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
const CHAIN_REACTION_CHANCE = 0.15

export type DopamineEngine = {
  state: DopamineState
  triggerCueFromComment: (event: PlatformViewerEvent) => void
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
    (cue: MutationCue) => {
      const targetVisual = cueToVisualParams(cue)
      const voice = cueToVoiceParams(cue)

      setState((prev) => {
        const next: DopamineState = {
          ...prev,
          phase: "triggered",
          targetVisual,
          voice,
          activeCue: cue,
        }
        return next
      })

      // Start the visual morph animation
      startMorphing(targetVisual, targetVisual.morphDurationMs)

      // Random chain reaction
      if (Math.random() < CHAIN_REACTION_CHANCE) {
        setTimeout(() => {
          const chainCue: MutationCue = {
            kind: "chain_reaction",
            intensity: 0.8,
            receivedAt: new Date().toISOString(),
          }
          triggerCue(chainCue)
        }, targetVisual.morphDurationMs + 500)
      }
    },
    [startMorphing],
  )

  const triggerCueFromComment = useCallback(
    (event: PlatformViewerEvent) => {
      if (event.kind !== "comment" || !event.text) return
      const cue = buildCommentCue(event.text, event.receivedAt)
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
