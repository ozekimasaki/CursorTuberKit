import { useEffect, useRef, useState } from "react"
import { characterProfile } from "../shared/characterProfile"
import {
  createIdlePlatformChatState,
  type PlatformChatMode,
  type PlatformChatState,
  type PlatformChatStateResponse,
  type PlatformViewerEvent,
} from "../shared/platformChat"
import { ControlDock } from "./components/ControlDock"
import { MaidCatAvatar, type AvatarState } from "./components/MaidCatAvatar"
import { playAudioBlob } from "./lib/audioPlayback"
import { inferEmotionFromText, type Emotion } from "./lib/emotion"
import {
  fetchPlatformChatState,
  startPlatformChat,
  stopPlatformChat,
} from "./lib/platformChat"
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
  const [platformMode, setPlatformMode] = useState<PlatformChatMode>("youtube")
  const [platformTarget, setPlatformTarget] = useState("")
  const [platformState, setPlatformState] = useState<PlatformChatState>(createIdlePlatformChatState())
  const [liveViewerEvents, setLiveViewerEvents] = useState<PlatformViewerEvent[]>([])
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const autoReplyEnabledRef = useRef(autoReplyEnabled)
  const autoReplyBusyRef = useRef(false)
  const autoReplyQueueRef = useRef<PlatformViewerEvent[]>([])

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

  useEffect(() => {
    autoReplyEnabledRef.current = autoReplyEnabled

    if (!autoReplyEnabled) {
      autoReplyQueueRef.current = []
      return
    }

    void pumpAutoReplyQueue()
  }, [autoReplyEnabled])

  useEffect(() => {
    const abortController = new AbortController()

    fetchPlatformChatState(abortController.signal)
      .then(applyPlatformChatStateResponse)
      .catch(() => {
        // ignore initial fetch failures and let SSE retry path recover
      })

    return () => abortController.abort()
  }, [])

  useEffect(() => {
    const eventSource = new EventSource("/api/platform-chat/stream")

    const handleState = (event: Event) => {
      const nextState = readSseData<PlatformChatState>(event)

      if (nextState) {
        setPlatformState(nextState)

        if (nextState.mode) {
          setPlatformMode(nextState.mode)
        }

        if (nextState.target) {
          setPlatformTarget(nextState.target)
        }

        if (nextState.status === "idle") {
          autoReplyQueueRef.current = []
        }
      }
    }

    const handleViewerEvent = (event: Event) => {
      const viewerEvent = readSseData<PlatformViewerEvent>(event)

      if (!viewerEvent) {
        return
      }

      setLiveViewerEvents((current) => insertViewerEvent(current, viewerEvent))

      if (autoReplyEnabledRef.current) {
        enqueueAutoReplyEvent(viewerEvent)
      }
    }

    eventSource.addEventListener("state", handleState as EventListener)
    eventSource.addEventListener("viewer-event", handleViewerEvent as EventListener)

    return () => {
      eventSource.removeEventListener("state", handleState as EventListener)
      eventSource.removeEventListener("viewer-event", handleViewerEvent as EventListener)
      eventSource.close()
    }
  }, [])

  async function runPrompt(prompt: string, options?: { interruptCurrent?: boolean }) {
    const trimmedPrompt = prompt.trim()

    if (!trimmedPrompt) {
      showError("プロンプトを入力してください。")
      setEmotion("neutral")
      setStatus("error")
      setAvatarState("error")
      setViseme("closed")
      return
    }

    const interruptCurrent = options?.interruptCurrent ?? true

    if (!interruptCurrent && abortRef.current) {
      return
    }

    if (interruptCurrent) {
      abortRef.current?.abort()
    }

    const abortController = new AbortController()
    abortRef.current = abortController
    setResponseText("")
    clearError()
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
      showError(speechError.message)
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
      showError(message)
      setEmotion("neutral")
      setStatus("error")
      setAvatarState("error")
      setViseme("closed")
    } finally {
      if (abortRef.current === abortController) {
        abortRef.current = null
      }

      if (autoReplyEnabledRef.current) {
        void pumpAutoReplyQueue()
      }
    }
  }

  async function handlePrompt(prompt: string) {
    await runPrompt(prompt, { interruptCurrent: true })
  }

  async function handlePlatformStart() {
    const target = platformTarget.trim()

    if (!target) {
      showError("接続先のURLまたはチャンネル名を入力してください。")
      return
    }

    setPlatformState((current) => ({
      ...current,
      lastError: null,
      mode: platformMode,
      status: "connecting",
      target,
      updatedAt: new Date().toISOString(),
    }))

    try {
      applyPlatformChatStateResponse(await startPlatformChat({ mode: platformMode, target }))
    } catch (error) {
      const message = error instanceof Error ? error.message : "配信コメント接続の開始に失敗しました。"
      showError(message)
      setPlatformState((current) => ({
        ...current,
        lastError: message,
        status: "error",
        updatedAt: new Date().toISOString(),
      }))
    }
  }

  async function handlePlatformStop() {
    autoReplyQueueRef.current = []

    try {
      applyPlatformChatStateResponse(await stopPlatformChat())
    } catch (error) {
      const message = error instanceof Error ? error.message : "配信コメント接続の停止に失敗しました。"
      showError(message)
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

  function showError(message: string) {
    setDismissedError(null)
    setErrorMessage(message)
  }

  function clearError() {
    setErrorMessage(null)
    setDismissedError(null)
  }

  function applyPlatformChatStateResponse(payload: PlatformChatStateResponse) {
    setPlatformState(payload.state)
    setLiveViewerEvents(payload.recentEvents.slice(0, 12))

    if (payload.state.mode) {
      setPlatformMode(payload.state.mode)
    }

    if (payload.state.target) {
      setPlatformTarget(payload.state.target)
    }
  }

  function enqueueAutoReplyEvent(event: PlatformViewerEvent) {
    autoReplyQueueRef.current = event.isMonetized
      ? [event, ...autoReplyQueueRef.current.filter((item) => item.id !== event.id)]
      : [...autoReplyQueueRef.current.filter((item) => item.id !== event.id), event]

    void pumpAutoReplyQueue()
  }

  async function pumpAutoReplyQueue() {
    if (!autoReplyEnabledRef.current || autoReplyBusyRef.current || abortRef.current) {
      return
    }

    const nextEvent = autoReplyQueueRef.current.shift()

    if (!nextEvent) {
      return
    }

    autoReplyBusyRef.current = true

    try {
      await runPrompt(buildAutoReplyPrompt(nextEvent), { interruptCurrent: false })
    } finally {
      autoReplyBusyRef.current = false

      if (autoReplyEnabledRef.current && autoReplyQueueRef.current.length > 0) {
        void pumpAutoReplyQueue()
      }
    }
  }

  const visibleError = errorMessage && errorMessage !== dismissedError ? errorMessage : null

  return (
    <>
      <section
        className={`stage${dockOpen ? " stage--dock-open" : ""}`}
        aria-label="配信用アバターステージ"
      >
        <div className="stage__backdrop" aria-hidden="true" />
        <div className="stage__grid" aria-hidden="true" />
        <div className="stage__horizon" aria-hidden="true" />
        <div className="stage__aura" aria-hidden="true" />
        <div className="stage__avatar-shell">
          <div className="stage__avatar">
            <MaidCatAvatar emotion={emotion} state={avatarState} viseme={viseme} />
          </div>
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
          <span>コメント</span>
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
        platformMode={platformMode}
        platformTarget={platformTarget}
        platformState={platformState}
        liveViewerEvents={liveViewerEvents}
        autoReplyEnabled={autoReplyEnabled}
        onAutoReplyEnabledChange={setAutoReplyEnabled}
        onPlatformModeChange={setPlatformMode}
        onPlatformStart={handlePlatformStart}
        onPlatformStop={handlePlatformStop}
        onPlatformTargetChange={setPlatformTarget}
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

function insertViewerEvent(current: PlatformViewerEvent[], next: PlatformViewerEvent) {
  return [next, ...current.filter((event) => event.id !== next.id)].slice(0, 12)
}

function buildAutoReplyPrompt(event: PlatformViewerEvent) {
  const monetizationText = event.monetization?.amountText ? ` / ${event.monetization.amountText}` : ""
  const eventKindLabel = describeEventKind(event)

  return [
    `配信中の視聴者コメントです。${event.authorName}さんが ${event.platform} で送ってくれました。`,
    `種別: ${eventKindLabel}${monetizationText}`,
    `コメント: ${event.text}`,
    "Catlin本人として、そのまま配信で話す感じで自然に返事してください。",
  ].join("\n")
}

function describeEventKind(event: PlatformViewerEvent) {
  switch (event.kind) {
    case "comment":
      return "通常コメント"
    case "superchat":
      return "スーパーチャット"
    case "paid_sticker":
      return "有料スタンプ"
    case "membership":
      return "メンバー加入"
    case "subscription":
      return "サブスク"
    case "gift_subscription":
      return "ギフトサブスク"
    case "cheer":
      return "Cheer"
    case "hype_chat":
      return "Hype Chat"
  }
}

function readSseData<T>(event: Event) {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") {
    return null
  }

  try {
    return JSON.parse(event.data) as T
  } catch {
    return null
  }
}
