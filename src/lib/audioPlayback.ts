import { textToVisemeSteps, type Viseme, type VisemeStep } from "./visemes"
import type { MotionPngAudioAnalysis } from "./avatarConfig"

type PlayAudioOptions = {
  onAnalysis?: (analysis: MotionPngAudioAnalysis) => void
  text?: string
  onEnded: () => void
  onError: (error: Error) => void
  onStart: () => void
  onViseme: (viseme: Viseme) => void
  signal: AbortSignal
}

const FALLBACK_VOWEL_CYCLE: Viseme[] = ["a", "i", "u", "e", "o"]
const INTENSITY_OPEN_THRESHOLD = 0.045
const INTENSITY_CLOSE_THRESHOLD = 0.025
const FALLBACK_VOWEL_INTERVAL_MS = 130

export async function playAudioBlob(blob: Blob, options: PlayAudioOptions): Promise<void> {
  const audioUrl = URL.createObjectURL(blob)
  const audio = new Audio(audioUrl)
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext
  const audioContext = AudioContextClass ? new AudioContextClass() : null
  const analyser = audioContext?.createAnalyser() ?? null
  const source = audioContext ? audioContext.createMediaElementSource(audio) : null
  const frequencyData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null
  const timeDomainData = analyser ? new Float32Array(analyser.fftSize) : null
  let animationFrameId: number | null = null
  let settled = false
  let smoothedIntensity = 0
  let lastEmitted: Viseme = "closed"
  let isOpen = false
  let fallbackStartMs = 0
  let fallbackIndex = 0
  let lowpassState = 0

  const visemeSteps: VisemeStep[] = options.text ? textToVisemeSteps(options.text) : []
  const totalWeight = visemeSteps.reduce((acc, step) => acc + step.weight, 0)
  const cumulative: number[] = []
  let acc = 0
  for (const step of visemeSteps) {
    acc += step.weight
    cumulative.push(acc)
  }

  if (analyser) {
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.2
  }

  if (source && analyser && audioContext) {
    source.connect(analyser)
    analyser.connect(audioContext.destination)
  }

  const emit = (viseme: Viseme) => {
    if (viseme === lastEmitted) return
    lastEmitted = viseme
    options.onViseme(viseme)
  }

  const pickScheduledViseme = (): Viseme => {
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0

    if (visemeSteps.length > 0 && duration > 0 && totalWeight > 0) {
      const progress = Math.min(audio.currentTime / duration, 0.999)
      const target = progress * totalWeight
      for (let i = 0; i < cumulative.length; i++) {
        if (target < cumulative[i]) {
          return visemeSteps[i].viseme
        }
      }
      return visemeSteps[visemeSteps.length - 1].viseme
    }

    const elapsed = performance.now() - fallbackStartMs
    const idx = Math.floor(elapsed / FALLBACK_VOWEL_INTERVAL_MS)
    if (idx !== fallbackIndex) {
      fallbackIndex = idx
    }
    return FALLBACK_VOWEL_CYCLE[fallbackIndex % FALLBACK_VOWEL_CYCLE.length]
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId)
      audio.pause()
      audio.src = ""
      URL.revokeObjectURL(audioUrl)
      emit("closed")
      void audioContext?.close().catch(() => undefined)
    }

    const finish = () => {
      if (settled) return
      settled = true
      cleanup()
      options.onEnded()
      resolve()
    }

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      options.onError(error)
      reject(error)
    }

    const abort = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    const tick = () => {
      if (audio.paused || audio.ended) return

      if (!analyser || !frequencyData || !timeDomainData) {
        const elapsed = performance.now() - fallbackStartMs
        const cyclePosition = elapsed % (FALLBACK_VOWEL_INTERVAL_MS * 2)
        emit(cyclePosition < FALLBACK_VOWEL_INTERVAL_MS * 1.35 ? pickScheduledViseme() : "closed")
        animationFrameId = requestAnimationFrame(tick)
        return
      }

      analyser.getByteFrequencyData(frequencyData)
      analyser.getFloatTimeDomainData(timeDomainData)

      const averageFrequency =
        frequencyData.reduce((sum, value) => sum + value, 0) / frequencyData.length / 255
      const rms = Math.sqrt(
        timeDomainData.reduce((sum, value) => {
          return sum + value * value
        }, 0) / timeDomainData.length,
      )
      const sampleRate = audioContext?.sampleRate ?? 48_000
      const lowAlpha = 1 - Math.exp((-2 * Math.PI * 700) / sampleRate)
      let lowEnergy = 0
      let highEnergy = 0

      for (const value of timeDomainData) {
        const low = lowpassState + lowAlpha * (value - lowpassState)
        lowpassState = low
        const high = value - low
        lowEnergy += low * low
        highEnergy += high * high
      }

      options.onAnalysis?.({
        high: highEnergy / timeDomainData.length,
        low: lowEnergy / timeDomainData.length,
        rms,
      })
      const boosted = Math.max(0, Math.min(1, averageFrequency * 0.8 + rms * 2.4))
      const attack = 0.7
      const release = 0.25
      smoothedIntensity =
        boosted > smoothedIntensity
          ? smoothedIntensity + (boosted - smoothedIntensity) * attack
          : smoothedIntensity + (boosted - smoothedIntensity) * release
      const intensity = smoothedIntensity

      if (isOpen) {
        if (intensity < INTENSITY_CLOSE_THRESHOLD) {
          isOpen = false
          emit("closed")
        } else {
          emit(pickScheduledViseme())
        }
      } else if (intensity >= INTENSITY_OPEN_THRESHOLD) {
        isOpen = true
        emit(pickScheduledViseme())
      }

      animationFrameId = requestAnimationFrame(tick)
    }

    options.signal.addEventListener("abort", abort, { once: true })
    audio.addEventListener("ended", finish, { once: true })
    audio.addEventListener(
      "error",
      () => fail(new Error("VOICEVOX音声の再生に失敗しました。")),
      { once: true },
    )

    if (options.signal.aborted) {
      abort()
      return
    }

    const startPlayback = async () => {
      if (audioContext) {
        await audioContext.resume()
      }

      await audio.play()
      options.onStart()
      fallbackStartMs = performance.now()
      tick()
    }

    void startPlayback()
      .catch((error: unknown) => {
        fail(error instanceof Error ? error : new Error("VOICEVOX音声を再生できませんでした。"))
      })
  })
}
