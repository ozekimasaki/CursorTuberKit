import { playAudioBlob } from "./audioPlayback"
import { synthesizeVoice } from "./voicevox"
import { inferEmotionFromText } from "./emotion"
import { waitForQueuedPlaybackGap } from "./speechSegments"
import type { Emotion } from "../../shared/emotion"
import type { MotionPngAudioAnalysis } from "./avatarConfig"
import type { VoiceMutationRequest } from "./voicevox"
import type { Viseme } from "./visemes"

export interface SpeechSegment {
  blob: Blob
  emotion: Emotion
  text: string
}

export interface SpeechPipelineCallbacks {
  onAnalysis?: (analysis: MotionPngAudioAnalysis) => void
  outputDeviceId?: string
  onStart?: (segment: SpeechSegment, meta: { firstAudio: boolean; startedAt: number }) => void
  onViseme?: (viseme: Viseme) => void
  onEnded?: () => void
  onError?: (error: Error) => void
  onSynthesizing?: () => void
  onPlaybackDone?: () => void
}

export class SpeechPipeline {
  private abortSignal: AbortSignal
  private audioQueue: SpeechSegment[] = []
  private playbackActive = false
  private pendingSynthesisCount = 0
  private synthesisTail = Promise.resolve()
  private speechError: Error | null = null
  private playbackPromise: Promise<void> | null = null
  private firstAudioObserved = false
  private callbacks: SpeechPipelineCallbacks
  private readonly startedAt: number
  private voice: VoiceMutationRequest

  constructor(options: {
    abortSignal: AbortSignal
    callbacks: SpeechPipelineCallbacks
    voice: VoiceMutationRequest
    startedAt?: number
  }) {
    this.abortSignal = options.abortSignal
    this.callbacks = options.callbacks
    this.voice = options.voice
    this.startedAt = options.startedAt ?? performance.now()
  }

  enqueueText(segment: string) {
    const normalized = segment.trim()
    if (!normalized) return
    const emotion = inferEmotionFromText(normalized)
    this.pendingSynthesisCount += 1
    this.synthesisTail = this.synthesisTail
      .then(async () => {
        if (this.abortSignal.aborted) return
        const wav = await synthesizeVoice(normalized, this.abortSignal, this.voice)
        this.audioQueue.push({ blob: wav, emotion, text: normalized })
        this.startPlaybackIfNeeded()
      })
      .catch((error: unknown) => {
        this.handleSpeechError(error)
      })
      .finally(() => {
        this.pendingSynthesisCount -= 1
        if (
          !this.abortSignal.aborted &&
          !this.speechError &&
          !this.playbackActive &&
          this.pendingSynthesisCount > 0
        ) {
          this.callbacks.onSynthesizing?.()
        }
        this.finalizeIfDone()
      })
  }

  enqueuePreSynthesized(segments: SpeechSegment[]) {
    for (const s of segments) {
      this.audioQueue.push(s)
    }
    this.startPlaybackIfNeeded()
  }

  private startPlaybackIfNeeded() {
    if (this.playbackActive || this.audioQueue.length === 0 || this.abortSignal.aborted) {
      return
    }

    this.playbackActive = true
    this.playbackPromise = (async () => {
      let hasPlayedSegment = false

      try {
        while (this.audioQueue.length > 0 && !this.abortSignal.aborted) {
          const next = this.audioQueue.shift()
          if (!next) {
            continue
          }

          if (hasPlayedSegment) {
            await waitForQueuedPlaybackGap(this.abortSignal)
          }

          await playAudioBlob(next.blob, {
            onAnalysis: this.callbacks.onAnalysis,
            outputDeviceId: this.callbacks.outputDeviceId,
            text: next.text,
            signal: this.abortSignal,
            onStart: () => {
              if (!this.speechError && !this.abortSignal.aborted) {
                const isFirst = !this.firstAudioObserved
                if (isFirst) {
                  this.firstAudioObserved = true
                }
                this.callbacks.onStart?.(next, { firstAudio: isFirst, startedAt: this.startedAt })
              }
            },
            onViseme: this.callbacks.onViseme ?? (() => {}),
            onEnded: () => {
              if (!this.speechError && !this.abortSignal.aborted) {
                this.callbacks.onEnded?.()
              }
            },
            onError: (error: Error) => {
              if (!this.abortSignal.aborted) {
                this.callbacks.onError?.(error)
              }
            },
          })
          hasPlayedSegment = true
        }
      } catch (error) {
        this.handleSpeechError(error)
      }

      this.playbackActive = false

      if (!this.abortSignal.aborted && !this.speechError) {
        if (this.pendingSynthesisCount > 0) {
          this.callbacks.onSynthesizing?.()
        } else {
          this.finalizeIfDone()
        }
      }
    })()
  }

  private handleSpeechError(error: unknown) {
    if (this.abortSignal.aborted) {
      return
    }
    this.speechError = error instanceof Error ? error : new Error("VOICEVOX音声の処理に失敗しました。")
    this.audioQueue.length = 0
    this.callbacks.onError?.(this.speechError)
  }

  private finalizeIfDone() {
    if (this.abortSignal.aborted || this.playbackActive || this.pendingSynthesisCount > 0) {
      return
    }
    if (this.speechError) {
      return
    }
    this.callbacks.onPlaybackDone?.()
  }

  async awaitCompletion() {
    await this.synthesisTail
    if (this.playbackPromise) {
      await this.playbackPromise
    }
  }

  get hasError() {
    return !!this.speechError
  }

  get isAborted() {
    return this.abortSignal.aborted
  }

  get hasPendingWork() {
    return this.playbackActive || this.pendingSynthesisCount > 0 || this.audioQueue.length > 0
  }

  get hasPlayedAudio() {
    return this.firstAudioObserved
  }
}
