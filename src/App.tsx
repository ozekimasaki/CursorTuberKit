import { useEffect, useRef, useState } from "react"
import { characterProfile } from "../shared/characterProfile"
import { ControlDock } from "./components/ControlDock"
import { MaidCatAvatar, type AvatarState } from "./components/MaidCatAvatar"
import { playAudioBlob } from "./lib/audioPlayback"
import { inferEmotionFromText, type Emotion } from "./lib/emotion"
import { streamAiResponse, type ConversationTurn } from "./lib/streamAi"
import type { Viseme } from "./lib/visemes"
import { fetchVoicevoxHealth, synthesizeVoice, type VoicevoxHealth } from "./lib/voicevox"

export type StreamStatus = "ready" | "thinking" | "synthesizing" | "playing" | "error"

const stageStatusLabel: Record<StreamStatus, string> = {
  ready: "待機中",
  thinking: "考え中",
  synthesizing: "音声生成中",
  playing: "発話中",
  error: "エラー",
}

export function App() {
  const [avatarState, setAvatarState] = useState<AvatarState>("idle")
  const [status, setStatus] = useState<StreamStatus>("ready")
  const [responseText, setResponseText] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [emotion, setEmotion] = useState<Emotion>("neutral")
  const [viseme, setViseme] = useState<Viseme>("closed")
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [voicevoxHealth, setVoicevoxHealth] = useState<VoicevoxHealth | null>(null)
  const [dockOpen, setDockOpen] = useState(true)
  const [dismissedError, setDismissedError] = useState<string | null>(null)
  const [recentTurns, setRecentTurns] = useState<ConversationTurn[]>([])
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (typeof document === "undefined") return
    document.body.classList.toggle("dock-open", dockOpen)
  }, [dockOpen])

  useEffect(() => {
    const abortController = new AbortController()

    fetchVoicevoxHealth(abortController.signal)
      .then((health) => setVoicevoxHealth(health))
      .catch(() => {
        setVoicevoxHealth({
          ok: false,
          speaker: 1,
          url: "http://127.0.0.1:50021",
          version: null,
        })
      })

    return () => abortController.abort()
  }, [])

  async function handlePrompt(prompt: string) {
    const trimmedPrompt = prompt.trim()

    if (!trimmedPrompt) {
      setErrorMessage("プロンプトを入力してください。")
      setEmotion("neutral")
      setStatus("error")
      setAvatarState("error")
      setViseme("closed")
      return
    }

    abortRef.current?.abort()

    const abortController = new AbortController()
    abortRef.current = abortController
    setResponseText("")
    setErrorMessage(null)
    setEmotion("neutral")
    setStatus("thinking")
    setAvatarState("thinking")
    setViseme("closed")
    let fullResponseText = ""
    let pendingSpeechText = ""
    let synthesisTail = Promise.resolve()
    let playbackPromise: Promise<void> | null = null
    let playbackActive = false
    let textStreamCompleted = false
    let pendingSynthesisCount = 0
    let speechError: Error | null = null
    const audioQueue: Array<{ blob: Blob; emotion: Emotion; text: string }> = []

    const canUpdateSpeechState = () => !speechError && !abortController.signal.aborted

    const handleSpeechError = (error: unknown) => {
      if (abortController.signal.aborted) {
        return
      }

      speechError = error instanceof Error ? error : new Error("VOICEVOX音声の処理に失敗しました。")
      audioQueue.length = 0
      setErrorMessage(speechError.message)
      setEmotion("neutral")
      setStatus("error")
      setAvatarState("error")
      setViseme("closed")
      abortController.abort()
    }

    const finalizeIfDone = () => {
      if (abortController.signal.aborted) {
        return
      }

      if (playbackActive || pendingSynthesisCount > 0 || !textStreamCompleted) {
        return
      }

      if (speechError) {
        setStatus("error")
        setAvatarState("error")
        setViseme("closed")
        return
      }

      setStatus("ready")
      setEmotion("neutral")
      setAvatarState("idle")
      setViseme("closed")
    }

    const startPlaybackIfNeeded = () => {
      if (playbackActive || audioQueue.length === 0 || abortController.signal.aborted) {
        return
      }

      playbackActive = true
      playbackPromise = (async () => {
        try {
          while (audioQueue.length > 0 && !abortController.signal.aborted) {
            const next = audioQueue.shift()

            if (!next) {
              continue
            }

            await playAudioBlob(next.blob, {
              text: next.text,
              signal: abortController.signal,
              onStart: () => {
                if (canUpdateSpeechState()) {
                  setEmotion(next.emotion)
                  setStatus("playing")
                  setAvatarState("speaking")
                }
              },
              onViseme: setViseme,
              onEnded: () => {
                if (canUpdateSpeechState()) {
                  setViseme("closed")
                }
              },
              onError: handleSpeechError,
            })
          }
        } catch (error) {
          handleSpeechError(error)
        }

        playbackActive = false

        if (!abortController.signal.aborted && !speechError) {
          if (pendingSynthesisCount > 0) {
            setEmotion("neutral")
            setStatus("synthesizing")
            setAvatarState("thinking")
          } else {
            finalizeIfDone()
          }
        }
      })()
    }

    const enqueueSpeechSegment = (segment: string) => {
      const normalizedSegment = segment.trim()

      if (!voiceEnabled || !normalizedSegment) {
        return
      }

      const emotion = inferEmotionFromText(normalizedSegment)
      pendingSynthesisCount += 1

      if (canUpdateSpeechState() && !playbackActive) {
        setStatus("synthesizing")
        setAvatarState("thinking")
      }

      synthesisTail = synthesisTail
        .then(async () => {
          if (abortController.signal.aborted) {
            return
          }

          const wav = await synthesizeVoice(normalizedSegment, abortController.signal)
          audioQueue.push({ blob: wav, emotion, text: normalizedSegment })
          startPlaybackIfNeeded()
        })
        .catch((error: unknown) => {
          handleSpeechError(error)
        })
        .finally(() => {
          pendingSynthesisCount -= 1

          if (
            !abortController.signal.aborted &&
            !speechError &&
            !playbackActive &&
            pendingSynthesisCount > 0
          ) {
            setStatus("synthesizing")
            setAvatarState("thinking")
          }

          finalizeIfDone()
        })
    }

    try {
      for await (const event of streamAiResponse({
        prompt: trimmedPrompt,
        recentTurns,
        signal: abortController.signal,
      })) {
        if (event.type === "state") {
          if (event.state === "thinking" && canUpdateSpeechState() && !playbackActive) {
            setStatus("thinking")
            setAvatarState("thinking")
          }

          if (event.state === "speaking" && canUpdateSpeechState() && !playbackActive) {
            setStatus("thinking")
            setAvatarState("thinking")
          }

          if (event.state === "done") {
            textStreamCompleted = true
            if (canUpdateSpeechState() && !playbackActive) {
              setStatus(voiceEnabled ? "synthesizing" : "ready")
              setAvatarState(voiceEnabled ? "thinking" : "idle")
            }
          }
        }

        if (event.type === "text") {
          fullResponseText += event.text
          pendingSpeechText += event.text
          if (canUpdateSpeechState() && !playbackActive) {
            setStatus("thinking")
            setAvatarState("thinking")
          }
          setResponseText((current) => current + event.text)

          if (canUpdateSpeechState()) {
            const { remainder, segments } = extractSpeechSegments(pendingSpeechText)
            pendingSpeechText = remainder
            segments.forEach(enqueueSpeechSegment)
          }
        }

        if (event.type === "error") {
          throw new Error(event.message)
        }
      }

      textStreamCompleted = true
      const completedAssistantText = fullResponseText.trim()

      if (completedAssistantText) {
        setRecentTurns((current) =>
          trimRecentTurns([
            ...current,
            { role: "user", text: trimmedPrompt },
            { role: "assistant", text: completedAssistantText },
          ]),
        )
      }

      if (voiceEnabled && fullResponseText.trim() && canUpdateSpeechState()) {
        const { segments } = extractSpeechSegments(pendingSpeechText, { force: true })
        segments.forEach(enqueueSpeechSegment)
        await synthesisTail

        if (playbackPromise) {
          await playbackPromise
        }

        finalizeIfDone()
        return
      }

      if (canUpdateSpeechState()) {
        setEmotion("neutral")
        setStatus("ready")
        setAvatarState("idle")
        setViseme("closed")
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        if (!speechError) {
          setEmotion("neutral")
          setStatus("ready")
          setAvatarState("idle")
          setViseme("closed")
        }
        return
      }

      const message = error instanceof Error ? error.message : "AI応答の取得に失敗しました。"
      setErrorMessage(message)
      setEmotion("neutral")
      setStatus("error")
      setAvatarState("error")
      setViseme("closed")
    } finally {
      if (abortRef.current === abortController) {
        abortRef.current = null
      }
    }
  }

  function handleCancel() {
    abortRef.current?.abort()
    abortRef.current = null
    setEmotion("neutral")
    setStatus("ready")
    setAvatarState("idle")
    setViseme("closed")
  }

  const promptSuggestions = [
    "配信開始の挨拶を、上品でかわいくお願い",
    "コメント欄が静かなときの場つなぎを考えて",
    "初見さんを歓迎する一言をやさしく作って",
    "配信終わりの締めコメントを余韻ありでお願い",
  ]

  const visibleError = errorMessage && errorMessage !== dismissedError ? errorMessage : null

  return (
    <>
      <section
        className={`stage${dockOpen ? " stage--dock-open" : ""}`}
        aria-label="配信用アバターステージ"
      >
        <div className="stage__backdrop" aria-hidden="true" />
        <div className="stage__grid" aria-hidden="true" />
        <div className="stage__avatar">
          <MaidCatAvatar emotion={emotion} state={avatarState} viseme={viseme} />
        </div>
      </section>

      <header className="topbar">
        <div className="brand">
          <span className="brand__dot" aria-hidden="true" />
          <span className="brand__name">{characterProfile.name}</span>
          <span className="brand__tag">{characterProfile.eyebrow}</span>
        </div>
        <div className="topbar__spacer" />
        <span className={`status-pill status-pill--${status}`}>{stageStatusLabel[status]}</span>
        <button
          className={`icon-btn${voiceEnabled ? " icon-btn--active" : ""}`}
          type="button"
          aria-label={voiceEnabled ? "音声をオフにする" : "音声をオンにする"}
          title={voiceEnabled ? "音声: オン" : "音声: オフ"}
          onClick={() => setVoiceEnabled(!voiceEnabled)}
        >
          {voiceEnabled ? "🔊" : "🔇"}
        </button>
      </header>

      <aside className="quick-chips" aria-label="クイックプロンプト">
        <p className="quick-chips__label">Quick Prompts</p>
        {promptSuggestions.map((s) => (
          <button
            key={s}
            type="button"
            className="chip"
            disabled={status === "thinking" || status === "synthesizing" || status === "playing"}
            onClick={() => {
              setDockOpen(true)
              handlePrompt(s)
            }}
          >
            {s}
          </button>
        ))}
      </aside>

      <section className="caption" aria-live="polite" aria-label="ライブキャプション">
        <div className="caption__head">
          <p className="caption__label">
            <span className="caption__live" aria-hidden="true" />
            LIVE CAPTION
          </p>
          <span className={`status-pill status-pill--${status}`}>{stageStatusLabel[status]}</span>
        </div>
        <p className={`caption__text${responseText ? "" : " caption__text--placeholder"}`}>
          {responseText || characterProfile.idleCaption}
        </p>
      </section>

      {visibleError && (
        <div className="toast" role="alert">
          <span className="toast__icon" aria-hidden="true">⚠️</span>
          <p className="toast__msg">{visibleError}</p>
          <button
            className="toast__close"
            type="button"
            aria-label="閉じる"
            onClick={() => setDismissedError(visibleError)}
          >
            ×
          </button>
        </div>
      )}

      {!dockOpen && (
        <button
          className="fab"
          type="button"
          onClick={() => setDockOpen(true)}
          aria-label="操作ドックを開く"
        >
          <span aria-hidden="true">💬</span>
          <span>話しかける</span>
        </button>
      )}

      <ControlDock
        open={dockOpen}
        onClose={() => setDockOpen(false)}
        errorMessage={errorMessage}
        onCancel={handleCancel}
        onSubmit={handlePrompt}
        responseText={responseText}
        status={status}
        voiceEnabled={voiceEnabled}
        voicevoxHealth={voicevoxHealth}
        onVoiceEnabledChange={setVoiceEnabled}
      />
    </>
  )
}

function trimRecentTurns(turns: ConversationTurn[]) {
  return turns.slice(-8)
}

function extractSpeechSegments(text: string, options?: { force?: boolean }) {
  const segments: string[] = []
  let remaining = text
  const sentenceBoundary = /[。！？!?…]\s*/
  const pauseBoundary = /[、，,]\s*/

  while (remaining.length > 0) {
    const sentenceMatch = sentenceBoundary.exec(remaining)

    if (sentenceMatch) {
      const splitIndex = sentenceMatch.index + sentenceMatch[0].length
      segments.push(remaining.slice(0, splitIndex).trim())
      remaining = remaining.slice(splitIndex)
      continue
    }

    if (remaining.length >= 26) {
      let splitIndex = -1
      let match: RegExpExecArray | null = null
      const pauseRegex = new RegExp(pauseBoundary.source, "g")

      while ((match = pauseRegex.exec(remaining)) !== null) {
        if (match.index + match[0].length >= 14) {
          splitIndex = match.index + match[0].length
        }
      }

      if (splitIndex === -1 && remaining.length >= 44) {
        splitIndex = 24
      }

      if (splitIndex !== -1) {
        segments.push(remaining.slice(0, splitIndex).trim())
        remaining = remaining.slice(splitIndex)
        continue
      }
    }

    break
  }

  if (options?.force && remaining.trim()) {
    segments.push(remaining.trim())
    remaining = ""
  }

  return {
    segments: segments.filter(Boolean),
    remainder: remaining,
  }
}
