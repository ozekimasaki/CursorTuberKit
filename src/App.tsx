import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react"
import {
  type AutomationAction,
  type AutomationEnvelope,
  type ChatAutomationRequest,
} from "../shared/automation"
import type { ChatMetadataPayload, ChatSessionPayload } from "../shared/chatStream"
import { characterProfile } from "../shared/characterProfile"
import type { Emotion, FinalEmotionPayload } from "../shared/emotion"
import type { ModerationAssessment } from "../shared/moderation"
import {
  createIdlePlatformChatState,
  type PlatformChatMode,
  type PlatformChatState,
  type PlatformChatStateResponse,
  type PlatformViewerEvent,
} from "../shared/platformChat"
import { ControlDock } from "./components/ControlDock"
import { MaidCatAvatar, type AvatarState } from "./components/MaidCatAvatar"
import { MotionPngAvatar, type MotionPngAvatarHandle } from "./components/MotionPngAvatar"
import { ViewerEventFeed } from "./components/ViewerEventFeed"
import { playAudioBlob } from "./lib/audioPlayback"
import {
  defaultMotionPngAssetStatus,
  defaultMotionPngSettings,
  type AvatarMode,
  type MotionPngAssetStatus,
  type MotionPngAudioAnalysis,
  type MotionPngSettings,
} from "./lib/avatarConfig"
import { deriveCharacterContentSurface } from "./lib/contentSurface"
import { inferEmotionFromText } from "./lib/emotion"
import {
  fetchPlatformChatState,
  startPlatformChat,
  stopPlatformChat,
} from "./lib/platformChat"
import {
  streamAiResponse,
  type ConversationTurn,
  type StreamMetadata,
} from "./lib/streamAi"
import { fetchRuntimeStatus, isChatRunRecap, type ChatRunRecap } from "./lib/runtimeStatus"
import type { Viseme } from "./lib/visemes"
import { fetchVoicevoxHealth, synthesizeVoice, type VoicevoxHealth } from "./lib/voicevox"
import type { CharacterContentSuggestion, CharacterContentSurface } from "./lib/contentSurface"

export type StreamStatus = "ready" | "thinking" | "synthesizing" | "playing" | "error"

const stageStatusLabel: Record<StreamStatus, string> = {
  ready: "待機中",
  thinking: "考え中",
  synthesizing: "音声生成中",
  playing: "発話中",
  error: "エラー",
}

const QUEUED_PLAYBACK_GAP_MS = 350
const MAX_QUEUED_VIEWER_EVENTS = 12
const MAX_AUTO_REPLY_RETRY_ATTEMPTS = 2
const MAX_CONCURRENT_AUTO_REPLY_GENERATIONS = 2
const COMPACT_REPLY_TRIGGER_COUNT = 6
const COMPACT_REPLY_BATCH_SIZE = 6
const AUTO_REPLY_BRIDGE_DELAY_MS = 1200
const AUTO_REPLY_BRIDGE_TEXT = "コメント順番に読んでいくね。"
const AUTO_CONTENT_OPENING_DELAY_MS = 250
const AUTO_CONTENT_VIEWER_FOLLOWUP_DELAY_MS = 900
const AUTO_CONTENT_MINI_CORNER_DELAY_MS = 1500
const AUTO_CONTENT_RECAP_DELAY_MS = 2200
const AUTO_CONTENT_TEASER_DELAY_MS = 3000
const AUTO_CONTENT_PREFETCH_DELAY_MS = 250

type AutomaticContentCandidate = {
  anchor: string
  reason: string
  suggestion: CharacterContentSuggestion
  source: "autopilot" | "opening" | "viewer"
  viewerEventId?: string
}

type ViewerEventTriageDecision = {
  action: "queue" | "skip"
  reason: string
  score: number
}

type PreparedAutoReply = {
  action: AutomationAction | null
  finalEmotion: Emotion | null
  id: string
  isMonetized: boolean
  moderation: ModerationAssessment | null
  responseText: string
  sequence: number
  source: "content" | "viewer"
}

export type RuntimeTone = "active" | "error" | "muted" | "ok" | "warn"

export type StreamRuntimeActivity = {
  detail: string | null
  id: string
  kind: string
  label: string
  status: string | null
  tone: RuntimeTone
}

type StageBackgroundMedia = {
  kind: "image" | "video"
  name: string
  url: string
}

type StreamRuntimeProgress = {
  activeDetail: string | null
  activeLabel: string | null
  activities: StreamRuntimeActivity[]
}

const MAX_RUNTIME_ACTIVITY_ITEMS = 6

function createIdleRuntimeProgress(): StreamRuntimeProgress {
  return {
    activeDetail: null,
    activeLabel: null,
    activities: [],
  }
}

function createPendingRuntimeProgress(): StreamRuntimeProgress {
  return appendRuntimeActivity(createIdleRuntimeProgress(), {
    detail: "サーバーとのストリーム接続を準備しています。",
    kind: "status",
    label: "リクエストを送信しました",
    status: "pending",
  })
}

function applyRuntimeStateEvent(progress: StreamRuntimeProgress, state: "thinking" | "speaking" | "done") {
  switch (state) {
    case "thinking":
      return appendRuntimeActivity(progress, {
        detail: "応答内容を考えています。",
        kind: "status",
        label: "考え中",
        status: "running",
      })
    case "speaking":
      return appendRuntimeActivity(progress, {
        detail: "字幕テキストを順次受信しています。",
        kind: "status",
        label: "返答をストリーム中",
        status: "running",
      })
    case "done":
      return appendRuntimeActivity(progress, {
        detail: "本文ストリームは完了しました。必要なら読み上げを続けます。",
        kind: "status",
        label: "本文ストリーム完了",
        status: "done",
      })
  }
}

function applyRuntimeMetadataEvent(progress: StreamRuntimeProgress, meta: StreamMetadata) {
  return appendRuntimeActivity(progress, {
    detail: meta.detail,
    kind: meta.kind,
    label: meta.name && !meta.label.includes(meta.name) ? `${meta.label} · ${meta.name}` : meta.label,
    status: meta.status,
  })
}

function appendRuntimeActivity(
  progress: StreamRuntimeProgress,
  activity: Omit<StreamRuntimeActivity, "id" | "tone">,
): StreamRuntimeProgress {
  const nextActivity: StreamRuntimeActivity = {
    ...activity,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tone: toneFromRuntimeStatus(activity.status),
  }

  return {
    activeDetail: activity.detail,
    activeLabel: activity.label,
    activities: [nextActivity, ...progress.activities].slice(0, MAX_RUNTIME_ACTIVITY_ITEMS),
  }
}

function finalizeRuntimeProgress(progress: StreamRuntimeProgress): StreamRuntimeProgress {
  if (!progress.activeLabel && progress.activities.length === 0) {
    return progress
  }

  return {
    activeDetail: progress.activeDetail,
    activeLabel: progress.activeLabel,
    activities:
      progress.activities.length > 0 && progress.activities[0].status !== "done"
        ? [
            {
              detail: "次のコメントを待っています。",
              id: `${Date.now()}-done`,
              kind: "status",
              label: "完了",
              status: "done",
              tone: "ok" as const,
            },
            ...progress.activities,
          ].slice(0, MAX_RUNTIME_ACTIVITY_ITEMS)
        : progress.activities,
  }
}

function describeRuntimeDisplay(
  status: StreamStatus,
  runtimeProgress: StreamRuntimeProgress,
  errorMessage: string | null,
  options?: {
    autoReplyEnabled: boolean
    nextAutomaticContentCandidate: AutomaticContentCandidate | null
    platformState: PlatformChatState
    recentViewerEventCount: number
  },
) {
  if (status === "error") {
    return {
      detail: errorMessage ?? runtimeProgress.activeDetail,
      label: "エラーが発生しました",
      tone: "error" as const,
    }
  }

  if (status === "playing") {
    return {
      detail: "VOICEVOX 音声を再生しながら口パクを同期しています。",
      label: "読み上げ中",
      tone: "active" as const,
    }
  }

  if (status === "synthesizing") {
    return {
      detail: "VOICEVOX で短い発話単位ごとに音声を準備しています。",
      label: "音声を準備中",
      tone: "warn" as const,
    }
  }

  if (status === "thinking" && runtimeProgress.activeLabel) {
    return {
      detail: runtimeProgress.activeDetail,
      label: runtimeProgress.activeLabel,
      tone: runtimeProgress.activities[0]?.tone ?? "warn",
    }
  }

  if (status === "ready") {
    if (options?.autoReplyEnabled) {
      return describeAutopilotReadyDisplay(options)
    }

    return {
      detail: responseReadyDetail(runtimeProgress),
      label: "待機中",
      tone: "ok" as const,
    }
  }

  return {
    detail: runtimeProgress.activeDetail,
    label: stageStatusLabel[status],
    tone: runtimeProgress.activities[0]?.tone ?? "muted",
  }
}

function describeAutopilotReadyDisplay(options: {
  nextAutomaticContentCandidate: AutomaticContentCandidate | null
  platformState: PlatformChatState
  recentViewerEventCount: number
}) {
  if (options.nextAutomaticContentCandidate) {
    return {
      detail: options.nextAutomaticContentCandidate.reason,
      label: "次ネタ待ち",
      tone: "warn" as const,
    }
  }

  if (options.platformState.status === "connected" && options.recentViewerEventCount > 0) {
    return {
      detail: "視聴者コメントを監視しつつ、空き時間は自動進行へ戻ります。",
      label: "コメント待ち",
      tone: "ok" as const,
    }
  }

  return {
    detail: "コメントが無くても、次の雑談ネタを自動で用意します。",
    label: "自動進行待ち",
    tone: "ok" as const,
  }
}

function responseReadyDetail(runtimeProgress: StreamRuntimeProgress) {
  const latestActivity = runtimeProgress.activities[0]

  if (!latestActivity) {
    return "次のコメントや手動入力を待っています。"
  }

  if (latestActivity.status === "error") {
    return latestActivity.detail
  }

  return latestActivity.status === "done"
    ? "前回の応答は完了しています。次の入力を待っています。"
    : latestActivity.detail
}

function toneFromRuntimeStatus(status: string | null): RuntimeTone {
  const normalized = status?.toLowerCase()

  if (!normalized) {
    return "muted"
  }

  if (["error", "failed"].includes(normalized)) {
    return "error"
  }

  if (["done", "completed", "complete", "ok", "success", "succeeded"].includes(normalized)) {
    return "ok"
  }

  if (["running", "working", "pending", "queued", "active", "synthesizing", "thinking"].includes(normalized)) {
    return "warn"
  }

  if (["playing", "streaming", "speaking"].includes(normalized)) {
    return "active"
  }

  return "muted"
}

export function App() {
  const [avatarMode, setAvatarMode] = useState<AvatarMode>("svg")
  const [avatarState, setAvatarState] = useState<AvatarState>("idle")
  const [status, setStatus] = useState<StreamStatus>("ready")
  const [responseText, setResponseText] = useState("")
  const [captionText, setCaptionText] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [emotion, setEmotion] = useState<Emotion>("neutral")
  const [viseme, setViseme] = useState<Viseme>("closed")
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [voicevoxHealth, setVoicevoxHealth] = useState<VoicevoxHealth | null>(null)
  const [runtimeProgress, setRuntimeProgress] = useState<StreamRuntimeProgress>(createIdleRuntimeProgress)
  const [providerMetadata, setProviderMetadata] = useState<ChatMetadataPayload | null>(null)
  const [sessionMetadata, setSessionMetadata] = useState<ChatSessionPayload | null>(null)
  const [finalEmotionPayload, setFinalEmotionPayload] = useState<FinalEmotionPayload | null>(null)
  const [latestRunRecap, setLatestRunRecap] = useState<ChatRunRecap | null>(null)
  const [latestAutomationEnvelope, setLatestAutomationEnvelope] = useState<AutomationEnvelope | null>(null)
  const [latestModeration, setLatestModeration] = useState<ModerationAssessment | null>(null)
  const [dockOpen, setDockOpen] = useState(true)
  const [streamScreenMode, setStreamScreenMode] = useState(false)
  const [dismissedError, setDismissedError] = useState<string | null>(null)
  const [recentTurns, setRecentTurns] = useState<ConversationTurn[]>([])
  const [platformMode, setPlatformMode] = useState<PlatformChatMode>("youtube")
  const [platformTarget, setPlatformTarget] = useState("")
  const [platformState, setPlatformState] = useState<PlatformChatState>(createIdlePlatformChatState())
  const [liveViewerEvents, setLiveViewerEvents] = useState<PlatformViewerEvent[]>([])
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false)
  const [stageBackgroundMedia, setStageBackgroundMedia] = useState<StageBackgroundMedia | null>(null)
  const [motionPngAssetStatus, setMotionPngAssetStatus] =
    useState<MotionPngAssetStatus>(defaultMotionPngAssetStatus)
  const [motionPngFiles, setMotionPngFiles] = useState<File[]>([])
  const [motionPngFolderLabel, setMotionPngFolderLabel] = useState<string | null>(null)
  const [motionPngSettings, setMotionPngSettings] = useState<MotionPngSettings>(defaultMotionPngSettings)
  const abortRef = useRef<AbortController | null>(null)
  const avatarModeRef = useRef<AvatarMode>(avatarMode)
  const autoReplyEnabledRef = useRef(autoReplyEnabled)
  const recentTurnsRef = useRef<ConversationTurn[]>([])
  const autoReplyGenerationCountRef = useRef(0)
  const autoReplyEventQueueRef = useRef<PlatformViewerEvent[]>([])
  const autoReplyRetryCountsRef = useRef<Map<string, number>>(new Map())
  const autoReplyRetryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const autoReplySeenEventIdsRef = useRef<Set<string>>(new Set())
  const bridgeSpeechCacheRef = useRef<Map<string, Blob>>(new Map())
  const preparedAutoReplyQueueRef = useRef<PreparedAutoReply[]>([])
  const preparedAutoReplySequenceRef = useRef(0)
  const preparedAutoReplyPlaybackBusyRef = useRef(false)
  const autoReplyGenerationAbortControllersRef = useRef<Set<AbortController>>(new Set())
  const autoContentAbortRef = useRef<AbortController | null>(null)
  const autoContentBusyRef = useRef(false)
  const autoContentScheduledKeyRef = useRef<string | null>(null)
  const autoContentExpandedViewerEventsRef = useRef<Set<string>>(new Set())
  const autoContentSequenceRef = useRef(0)
  const autoContentSessionBaseRef = useRef<string | null>(null)
  const motionPngAvatarRef = useRef<MotionPngAvatarHandle | null>(null)
  const stageBackgroundInputRef = useRef<HTMLInputElement | null>(null)
  const motionPngFolderInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (typeof document === "undefined") return
    document.body.classList.toggle("dock-open", dockOpen)
  }, [dockOpen])

  useEffect(() => {
    avatarModeRef.current = avatarMode
  }, [avatarMode])

  useEffect(() => {
    const input = motionPngFolderInputRef.current
    if (!input) {
      return
    }

    input.setAttribute("webkitdirectory", "")
    input.setAttribute("directory", "")
  }, [])

  useEffect(() => {
    const url = stageBackgroundMedia?.url

    return () => {
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
  }, [stageBackgroundMedia])

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
    const abortController = new AbortController()

    fetchRuntimeStatus(abortController.signal)
      .then((snapshot) => {
        setLatestRunRecap(snapshot.chatRuns.recent[0] ?? null)
      })
      .catch(() => {
        // ignore initial runtime status failures
      })

    return () => abortController.abort()
  }, [])

  function handleStreamScreenModeChange(enabled: boolean) {
    setStreamScreenMode(enabled)

    if (enabled) {
      setDockOpen(false)
    }
  }

  function resetAvatarMouth() {
    setViseme("closed")
    motionPngAvatarRef.current?.resetAudio()
  }

  function handleMotionPngAnalysis(data: MotionPngAudioAnalysis) {
    if (avatarModeRef.current !== "motionpng") {
      return
    }

    motionPngAvatarRef.current?.processAudioData(data)
  }

  function handleMotionPngAssetStatusChange(status: MotionPngAssetStatus) {
    setMotionPngAssetStatus(status)
  }

  function handleMotionPngFolderSelect() {
    motionPngFolderInputRef.current?.click()
  }

  function handleStageBackgroundSelect() {
    stageBackgroundInputRef.current?.click()
  }

  function handleStageBackgroundChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file) {
      return
    }

    setStageBackgroundMedia({
      kind: file.type.startsWith("video/") ? "video" : "image",
      name: file.name,
      url: URL.createObjectURL(file),
    })
  }

  function handleStageBackgroundClear() {
    setStageBackgroundMedia(null)
  }

  function handleMotionPngFolderChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""

    if (files.length === 0) {
      return
    }

    const folderLabel = deriveMotionPngFolderLabel(files)
    setMotionPngFiles(files)
    setMotionPngFolderLabel(folderLabel)
    setMotionPngAssetStatus({
      loaded: false,
      message: `${folderLabel} を読み込んでいます。`,
      tone: "loading",
    })
  }

  function handleMotionPngClear() {
    motionPngAvatarRef.current?.resetAudio()
    setMotionPngFiles([])
    setMotionPngFolderLabel(null)
    setMotionPngAssetStatus(defaultMotionPngAssetStatus)
  }

  function updateMotionPngSettings(patch: Partial<MotionPngSettings>) {
    setMotionPngSettings((current) => ({
      ...current,
      ...patch,
    }))
  }

  useEffect(() => {
    autoReplyEnabledRef.current = autoReplyEnabled

    if (!autoReplyEnabled) {
      resetAutoReplyQueues()
      autoContentAbortRef.current?.abort()
      autoContentScheduledKeyRef.current = null
      autoContentExpandedViewerEventsRef.current = new Set()
      autoContentSequenceRef.current = 0
      autoContentSessionBaseRef.current = null
      return
    }

    void pumpAutoReplyGenerationQueue()
    void pumpPreparedAutoReplyQueue()
  }, [autoReplyEnabled])

  useEffect(() => {
    if (!autoReplyEnabled || !voiceEnabled || bridgeSpeechCacheRef.current.has(AUTO_REPLY_BRIDGE_TEXT)) {
      return
    }

    const abortController = new AbortController()

    synthesizeVoice(AUTO_REPLY_BRIDGE_TEXT, abortController.signal)
      .then((wav) => {
        bridgeSpeechCacheRef.current.set(AUTO_REPLY_BRIDGE_TEXT, wav)
      })
      .catch(() => {
        // bridge fallback is best-effort only
      })

    return () => abortController.abort()
  }, [autoReplyEnabled, voiceEnabled])

  useEffect(() => {
    recentTurnsRef.current = recentTurns
  }, [recentTurns])

  useEffect(() => {
    if (!autoReplyEnabled) {
      return
    }

    const nextBase =
      platformState.status === "connected"
        ? `${platformState.mode ?? "chat"}:${platformState.target ?? "default"}`
        : "autopilot"

    if (autoContentSessionBaseRef.current === nextBase) {
      return
    }

    autoContentSessionBaseRef.current = nextBase
    autoContentSequenceRef.current = 0
    autoContentExpandedViewerEventsRef.current = new Set()
    autoContentScheduledKeyRef.current = null
    autoReplySeenEventIdsRef.current = new Set()
  }, [autoReplyEnabled, platformState.mode, platformState.status, platformState.target])

  useEffect(() => {
    if (!autoReplyEnabled) {
      return
    }

    for (const viewerEvent of [...liveViewerEvents].reverse()) {
      enqueueAutoReplyEvent(viewerEvent)
    }

    void pumpAutoReplyGenerationQueue()
    void pumpPreparedAutoReplyQueue()
  }, [autoReplyEnabled, liveViewerEvents])

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
          clearQueuedViewerReplies()
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

  async function streamPromptReply(options: {
    automation: ChatAutomationRequest
    bridgeSpeech?: string
    interruptCurrent?: boolean
    onCompletedText?: (assistantText: string) => void
    prompt: string
    recentTurns: ConversationTurn[]
    runtimeActivity?: {
      detail: string
      kind: string
      label: string
    }
  }) {
    const trimmedPrompt = options.prompt.trim()

    if (!trimmedPrompt) {
      showError("プロンプトを入力してください。")
      setEmotion("neutral")
      setStatus("error")
      setAvatarState("error")
      resetAvatarMouth()
      return { aborted: false, errorMessage: "プロンプトを入力してください。" }
    }

    const interruptCurrent = options.interruptCurrent ?? true

    if (!interruptCurrent && abortRef.current) {
      return { aborted: true, errorMessage: null }
    }

    if (interruptCurrent) {
      abortRef.current?.abort()
    }

    const abortController = new AbortController()
    abortRef.current = abortController
    setResponseText("")
    setCaptionText("")
    clearError()
    setEmotion("neutral")
    setStatus("thinking")
    setAvatarState("thinking")
    resetAvatarMouth()
    setFinalEmotionPayload(null)
    setLatestAutomationEnvelope(null)
    setLatestModeration(null)
    setRuntimeProgress(
      options.runtimeActivity
        ? appendRuntimeActivity(createPendingRuntimeProgress(), {
            detail: options.runtimeActivity.detail,
            kind: options.runtimeActivity.kind,
            label: options.runtimeActivity.label,
            status: "running",
          })
        : createPendingRuntimeProgress(),
    )
    let fullResponseText = ""
    let pendingSpeechText = ""
    let synthesisTail = Promise.resolve()
    let playbackPromise: Promise<void> | null = null
    let playbackActive = false
    let textStreamCompleted = false
    let pendingSynthesisCount = 0
    let speechError: Error | null = null
    let firstAudioObserved = false
    let finalEmotion: Emotion | null = null
    const requestStartedAt = performance.now()
    const audioQueue: Array<{ blob: Blob; emotion: Emotion; text: string }> = []
    let bridgeRequested = false

    const canUpdateSpeechState = () => !speechError && !abortController.signal.aborted

    const handleSpeechError = (error: unknown) => {
      if (abortController.signal.aborted) {
        return
      }

      speechError = error instanceof Error ? error : new Error("VOICEVOX音声の処理に失敗しました。")
      const speechErrorMessage = speechError.message
      audioQueue.length = 0
      showError(speechErrorMessage)
      setEmotion("neutral")
      setStatus("error")
      setAvatarState("error")
      resetAvatarMouth()
      setRuntimeProgress((current) =>
        appendRuntimeActivity(current, {
          detail: speechErrorMessage,
          kind: "voice",
          label: "VOICEVOX でエラーが発生しました",
          status: "error",
        }),
      )
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
        resetAvatarMouth()
        return
      }

      setCaptionText(fullResponseText.trim())
      setStatus("ready")
      setEmotion(finalEmotion ?? "neutral")
      setAvatarState("idle")
      resetAvatarMouth()
      setRuntimeProgress((current) => finalizeRuntimeProgress(current))
    }

    const startPlaybackIfNeeded = () => {
      if (playbackActive || audioQueue.length === 0 || abortController.signal.aborted) {
        return
      }

      playbackActive = true
      playbackPromise = (async () => {
        let hasPlayedSegment = false

        try {
          while (audioQueue.length > 0 && !abortController.signal.aborted) {
            const next = audioQueue.shift()

            if (!next) {
              continue
            }

            if (hasPlayedSegment) {
              await waitForQueuedPlaybackGap(abortController.signal)
            }

            await playAudioBlob(next.blob, {
              onAnalysis: handleMotionPngAnalysis,
              text: next.text,
              signal: abortController.signal,
              onStart: () => {
                if (canUpdateSpeechState()) {
                  if (!firstAudioObserved) {
                    firstAudioObserved = true
                    const latencyMs = Math.round(performance.now() - requestStartedAt)
                    setRuntimeProgress((current) =>
                      appendRuntimeActivity(current, {
                        detail: `${latencyMs}ms で話し始めました。`,
                        kind: "latency",
                        label: "初動レイテンシ",
                        status: "done",
                      }),
                    )
                  }
                  setCaptionText(next.text)
                  setEmotion(next.emotion)
                  setStatus("playing")
                  setAvatarState("speaking")
                }
              },
              onViseme: setViseme,
              onEnded: () => {
                if (canUpdateSpeechState()) {
                  resetAvatarMouth()
                }
              },
              onError: handleSpeechError,
            })
            hasPlayedSegment = true
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

    const bridgeTimerId =
      voiceEnabled && options.bridgeSpeech
        ? window.setTimeout(() => {
            const bridgeSpeech = options.bridgeSpeech

            if (
              abortController.signal.aborted ||
              speechError ||
              firstAudioObserved ||
              textStreamCompleted ||
              bridgeRequested ||
              !bridgeSpeech
            ) {
              return
            }

            bridgeRequested = true
            void getCachedBridgeSpeech(bridgeSpeech, abortController.signal)
              .then((wav) => {
                if (abortController.signal.aborted || speechError || firstAudioObserved) {
                  return
                }

                audioQueue.unshift({
                  blob: wav,
                  emotion: "neutral",
                  text: bridgeSpeech,
                })
                startPlaybackIfNeeded()
              })
              .catch(() => {
                // bridge fallback is best-effort only
              })
          }, AUTO_REPLY_BRIDGE_DELAY_MS)
        : null

    try {
      for await (const event of streamAiResponse({
        automation: options.automation,
        prompt: trimmedPrompt,
        recentTurns: options.recentTurns,
        signal: abortController.signal,
      })) {
        if (event.type === "moderation") {
          setLatestModeration(event.payload)
        }

        if (event.type === "automation") {
          setLatestAutomationEnvelope(event.payload)
        }

        if (event.type === "metadata") {
          setProviderMetadata(event.payload)
        }

        if (event.type === "session") {
          setSessionMetadata(event.payload)
        }

        if (event.type === "state") {
          setRuntimeProgress((current) => applyRuntimeStateEvent(current, event.state))

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
          setCaptionText((current) => current + event.text)

          if (canUpdateSpeechState()) {
            const { remainder, segments } = extractSpeechSegments(pendingSpeechText)
            pendingSpeechText = remainder
            segments.forEach(enqueueSpeechSegment)
          }
        }

        if (event.type === "emotion") {
          finalEmotion = event.payload.emotion
          setFinalEmotionPayload(event.payload)
        }

        if (event.type === "meta") {
          if (isChatRunRecap(event.meta.raw)) {
            setLatestRunRecap(event.meta.raw)
          }
          setRuntimeProgress((current) => applyRuntimeMetadataEvent(current, event.meta))
        }

        if (event.type === "error") {
          throw new Error(event.message)
        }
      }

      textStreamCompleted = true
      const completedAssistantText = fullResponseText.trim()

      if (completedAssistantText) {
        options.onCompletedText?.(completedAssistantText)
      }

      if (voiceEnabled && fullResponseText.trim() && canUpdateSpeechState()) {
        const { segments } = extractSpeechSegments(pendingSpeechText, { force: true })
        segments.forEach(enqueueSpeechSegment)
        await synthesisTail

        if (playbackPromise) {
          await playbackPromise
        }

        finalizeIfDone()
        return { aborted: false, errorMessage: null }
      }

      if (canUpdateSpeechState()) {
        setCaptionText(completedAssistantText)
        setEmotion(finalEmotion ?? "neutral")
        setStatus("ready")
        setAvatarState("idle")
        resetAvatarMouth()
        setRuntimeProgress((current) => finalizeRuntimeProgress(current))
      }

      return { aborted: false, errorMessage: null }
    } catch (error) {
      if (abortController.signal.aborted) {
        if (!speechError) {
          setEmotion("neutral")
          setStatus("ready")
          setAvatarState("idle")
          resetAvatarMouth()
          setRuntimeProgress((current) => finalizeRuntimeProgress(current))
        }
        return { aborted: true, errorMessage: null }
      }

      const message = error instanceof Error ? error.message : "AI応答の取得に失敗しました。"
      showError(message)
      setEmotion("neutral")
      setStatus("error")
      setAvatarState("error")
      resetAvatarMouth()
      setRuntimeProgress((current) =>
        appendRuntimeActivity(current, {
          detail: message,
          kind: "error",
          label: "ストリーム処理に失敗しました",
          status: "error",
        }),
      )
      return { aborted: false, errorMessage: message }
    } finally {
      if (bridgeTimerId !== null) {
        window.clearTimeout(bridgeTimerId)
      }

      if (abortRef.current === abortController) {
        abortRef.current = null
      }

      if (autoReplyEnabledRef.current) {
        void pumpAutoReplyGenerationQueue()
        void pumpPreparedAutoReplyQueue()
      }
    }
  }

  async function runPrompt(prompt: string, options?: { interruptCurrent?: boolean }) {
    await streamPromptReply({
      automation: { source: "manual" },
      interruptCurrent: options?.interruptCurrent ?? true,
      onCompletedText: (assistantText) => {
        appendRecentTurns(prompt.trim(), assistantText)
      },
      prompt,
      recentTurns: recentTurnsRef.current,
    })
  }

  function shouldStartDirectAutoReply() {
    return (
      !abortRef.current &&
      autoReplyGenerationCountRef.current === 0 &&
      preparedAutoReplyQueueRef.current.length === 0 &&
      autoReplyEventQueueRef.current.length === 0
    )
  }

  async function streamDirectAutoReply(event: PlatformViewerEvent) {
    autoReplyRetryCountsRef.current.delete(event.id)
    clearAutoReplyRetryTimer(event.id)

    const prompt = buildAutoReplyPrompt(event)
    const result = await streamPromptReply({
      automation: {
        replyStyle: "default",
        source: "platform_auto_reply",
        target: {
          platform: event.platform,
          target: event.target,
        },
      },
      bridgeSpeech: AUTO_REPLY_BRIDGE_TEXT,
      interruptCurrent: false,
      onCompletedText: (assistantText) => {
        appendRecentTurns(prompt, assistantText)
      },
      prompt,
      recentTurns: recentTurnsRef.current,
      runtimeActivity: {
        detail: `${event.authorName}さんのコメントへすぐ返します。`,
        kind: "autoreply",
        label: "コメント返答をライブ生成中",
      },
    })

    if (result.aborted) {
      autoReplyEventQueueRef.current = insertQueuedViewerEvent(autoReplyEventQueueRef.current, event)
      void pumpAutoReplyGenerationQueue()
      return
    }

    if (result.errorMessage) {
      scheduleAutoReplyRetry([event], result.errorMessage)
    }
  }

  async function handlePrompt(prompt: string) {
    abortAutoReplyGenerations()
    autoContentAbortRef.current?.abort()
    autoContentScheduledKeyRef.current = null
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
      try {
        applyPlatformChatStateResponse(await fetchPlatformChatState())
      } catch {
        setPlatformState((current) => ({
          ...current,
          lastError: message,
          status: "error",
          updatedAt: new Date().toISOString(),
        }))
      }
    }
  }

  async function handlePlatformStop() {
    resetAutoReplyQueues()

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
    resetAvatarMouth()
    setRuntimeProgress((current) =>
      appendRuntimeActivity(current, {
        detail: "現在のストリームを停止しました。",
        kind: "action",
        label: "応答を中断しました",
        status: "cancelled",
      }),
    )
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

  function resetAutoReplyQueues() {
    autoReplyEventQueueRef.current = []
    preparedAutoReplyQueueRef.current = []
    abortAutoReplyGenerations()
    autoContentAbortRef.current?.abort()
    autoContentScheduledKeyRef.current = null
    preparedAutoReplySequenceRef.current = 0
    autoReplyRetryCountsRef.current.clear()
    clearAutoReplyRetryTimers()
  }

  function clearQueuedViewerReplies() {
    autoReplyEventQueueRef.current = []
    abortAutoReplyGenerations()
    autoReplyRetryCountsRef.current.clear()
    clearAutoReplyRetryTimers()
  }

  function abortAutoReplyGenerations() {
    autoReplyGenerationAbortControllersRef.current.forEach((controller) => controller.abort())
    autoReplyGenerationAbortControllersRef.current.clear()
  }

  async function getCachedBridgeSpeech(text: string, signal: AbortSignal) {
    const cached = bridgeSpeechCacheRef.current.get(text)

    if (cached) {
      return cached
    }

    const wav = await synthesizeVoice(text, signal)
    bridgeSpeechCacheRef.current.set(text, wav)
    return wav
  }

  function appendRecentTurns(userText: string, assistantText: string) {
    const nextTurns = trimRecentTurns([
      ...recentTurnsRef.current,
      { role: "user", text: userText },
      { role: "assistant", text: assistantText },
    ])
    recentTurnsRef.current = nextTurns
    setRecentTurns(nextTurns)
  }

  function appendAssistantTurn(assistantText: string) {
    const normalizedAssistantText = assistantText.trim()

    if (!normalizedAssistantText) {
      return
    }

    const nextTurns = trimRecentTurns([
      ...recentTurnsRef.current,
      { role: "assistant", text: normalizedAssistantText },
    ])
    recentTurnsRef.current = nextTurns
    setRecentTurns(nextTurns)
  }

  function enqueueAutoReplyEvent(event: PlatformViewerEvent) {
    if (autoReplySeenEventIdsRef.current.has(event.id)) {
      return
    }

    autoReplySeenEventIdsRef.current.add(event.id)
    const triage = assessViewerEventTriage(event)

    if (triage.action === "skip") {
      setRuntimeProgress((current) =>
        appendRuntimeActivity(current, {
          detail: `${event.authorName}さんのコメントは ${triage.reason}`,
          kind: "filter",
          label: "コメントを見送りました",
          status: "done",
        }),
      )
      return
    }

    if (shouldStartDirectAutoReply()) {
      void streamDirectAutoReply(event)
      return
    }

    const nextQueue = insertQueuedViewerEvent(autoReplyEventQueueRef.current, event)

    if (!nextQueue.some((item) => item.id === event.id)) {
      setRuntimeProgress((current) =>
        appendRuntimeActivity(current, {
          detail: `${event.authorName}さんのコメントは流量が多いため、より優先度の高いコメントを先に読みます。`,
          kind: "filter",
          label: "コメントを優先度で圧縮しました",
          status: "done",
        }),
      )
      return
    }

    autoReplyEventQueueRef.current = nextQueue

    setRuntimeProgress((current) =>
      appendRuntimeActivity(current, {
        detail: `${event.authorName}さんのコメントを採択しました。${triage.reason} backlog ${nextQueue.length}件です。`,
        kind: "filter",
        label: "コメントを返答候補に追加",
        status: "done",
      }),
    )

    void pumpAutoReplyGenerationQueue()
  }

  function enqueuePreparedAutoReply(reply: PreparedAutoReply) {
    autoReplyRetryCountsRef.current.delete(reply.id)
    clearAutoReplyRetryTimer(reply.id)
    const nextReplies = [...preparedAutoReplyQueueRef.current.filter((item) => item.id !== reply.id), reply]
    const sortBySequence = (a: PreparedAutoReply, b: PreparedAutoReply) => a.sequence - b.sequence
    const monetizedReplies = nextReplies.filter((item) => item.isMonetized).sort(sortBySequence)
    const viewerReplies = nextReplies
      .filter((item) => !item.isMonetized && item.source === "viewer")
      .sort(sortBySequence)
    const contentReplies = nextReplies
      .filter((item) => !item.isMonetized && item.source === "content")
      .sort(sortBySequence)

    preparedAutoReplyQueueRef.current = [...monetizedReplies, ...viewerReplies, ...contentReplies]
  }

  function shouldAutoPlayPreparedReply(reply: PreparedAutoReply) {
    return true
  }

  function buildAutoReplyRetryKey(events: PlatformViewerEvent[]) {
    return events.map((event) => event.id).sort().join("|")
  }

  function scheduleAutoReplyRetry(events: PlatformViewerEvent[], message: string) {
    const retryKey = buildAutoReplyRetryKey(events)
    const currentAttempt = autoReplyRetryCountsRef.current.get(retryKey) ?? 0

    if (currentAttempt >= MAX_AUTO_REPLY_RETRY_ATTEMPTS) {
      autoReplyRetryCountsRef.current.delete(retryKey)
      clearAutoReplyRetryTimer(retryKey)
      showError(message)
      return
    }

    const nextAttempt = currentAttempt + 1
    const delayMs = 1_500 * nextAttempt
    const retrySubject =
      events.length > 1
        ? `${events.length}件のコメント`
        : `${events[0]?.authorName ?? "視聴者"}さんのコメント`
    autoReplyRetryCountsRef.current.set(retryKey, nextAttempt)
    clearAutoReplyRetryTimer(retryKey)
    setRuntimeProgress((current) =>
      appendRuntimeActivity(current, {
        detail: `${retrySubject}の返答生成が一時失敗しました。${Math.round(delayMs / 1000)}秒後に再試行します。`,
        kind: "autoreply",
        label: "自動返答を再試行します",
        status: "retrying",
      }),
    )

    const timer = setTimeout(() => {
      autoReplyRetryTimersRef.current.delete(retryKey)

      if (!autoReplyEnabledRef.current) {
        return
      }

      let nextQueue = autoReplyEventQueueRef.current
      for (const event of events) {
        nextQueue = insertQueuedViewerEvent(nextQueue, event)
      }
      autoReplyEventQueueRef.current = nextQueue
      void pumpAutoReplyGenerationQueue()
    }, delayMs)

    autoReplyRetryTimersRef.current.set(retryKey, timer)
  }

  function clearAutoReplyRetryTimer(eventId: string) {
    const timer = autoReplyRetryTimersRef.current.get(eventId)

    if (!timer) {
      return
    }

    clearTimeout(timer)
    autoReplyRetryTimersRef.current.delete(eventId)
  }

  function clearAutoReplyRetryTimers() {
    autoReplyRetryTimersRef.current.forEach((timer) => {
      clearTimeout(timer)
    })
    autoReplyRetryTimersRef.current.clear()
  }

  async function triggerAutomaticContentSuggestion(
    candidate: AutomaticContentCandidate,
    candidateKey: string,
  ) {
    if (
      !autoReplyEnabledRef.current ||
      autoContentBusyRef.current ||
      preparedAutoReplyQueueRef.current.length > 0
    ) {
      return
    }

    autoContentBusyRef.current = true
    const abortController = new AbortController()
    autoContentAbortRef.current = abortController

    setRuntimeProgress((current) =>
      appendRuntimeActivity(current, {
        detail: candidate.reason,
        kind: "content",
        label: `${candidate.suggestion.title} を自動で準備中`,
        status: "running",
      }),
    )

    try {
      const {
        emotionPayload,
        finalEmotion,
        latestRunRecap: generatedRunRecap,
        moderation,
        providerMetadata: generatedProviderMetadata,
        responseText,
        sessionMetadata: generatedSessionMetadata,
      } = await generatePromptResponse(
        candidate.suggestion.prompt,
        recentTurnsRef.current,
        abortController.signal,
        { source: "manual" },
      )

      if (generatedProviderMetadata) {
        setProviderMetadata(generatedProviderMetadata)
      }

      if (generatedSessionMetadata) {
        setSessionMetadata(generatedSessionMetadata)
      }

      if (emotionPayload) {
        setFinalEmotionPayload(emotionPayload)
      }

      if (generatedRunRecap) {
        setLatestRunRecap(generatedRunRecap)
      }

      if (moderation) {
        setLatestModeration(moderation)
      }

      appendAssistantTurn(responseText)
      enqueuePreparedAutoReply({
        action: null,
        finalEmotion,
        id: `content-${candidate.suggestion.id}-${Date.now()}`,
        isMonetized: false,
        moderation,
        responseText,
        sequence: preparedAutoReplySequenceRef.current++,
        source: "content",
      })
      if (candidate.viewerEventId) {
        autoContentExpandedViewerEventsRef.current.add(candidate.viewerEventId)
      }
      autoContentSequenceRef.current += 1
      setRuntimeProgress((current) =>
        appendRuntimeActivity(current, {
          detail: candidate.reason,
          kind: "content",
          label: `${candidate.suggestion.title} を自動で差し込みます`,
          status: "done",
        }),
      )
      await pumpPreparedAutoReplyQueue()
    } catch (error) {
      if (!abortController.signal.aborted && !isAbortError(error)) {
        const message = error instanceof Error ? error.message : "ネタ面の自動生成に失敗しました。"
        showError(message)
        setRuntimeProgress((current) =>
          appendRuntimeActivity(current, {
            detail: message,
            kind: "content",
            label: `${candidate.suggestion.title} の自動生成に失敗しました`,
            status: "error",
          }),
        )
      }
    } finally {
      if (autoContentAbortRef.current === abortController) {
        autoContentAbortRef.current = null
      }

      autoContentBusyRef.current = false
    }
  }

  async function pumpAutoReplyGenerationQueue() {
    if (!autoReplyEnabledRef.current) {
      return
    }

    while (
      autoReplyEnabledRef.current &&
      autoReplyGenerationCountRef.current < MAX_CONCURRENT_AUTO_REPLY_GENERATIONS
    ) {
      const queuedEvents = autoReplyEventQueueRef.current
      const compactBatch = takeCompactViewerReplyBatch(queuedEvents)
      const selectedEvents = compactBatch
        ? compactBatch
        : queuedEvents[0]
          ? [queuedEvents[0]]
          : []

      if (selectedEvents.length === 0) {
        return
      }

      const selectedEventIds = new Set(selectedEvents.map((event) => event.id))
      autoReplyEventQueueRef.current = compactBatch
        ? queuedEvents.filter((event) => !selectedEventIds.has(event.id))
        : queuedEvents.slice(1)

      autoReplyGenerationCountRef.current += 1
      const primaryEvent = selectedEvents[0]!
      const shortReplyMode = compactBatch !== null || shouldUseShortAutoReplyMode(autoReplyEventQueueRef.current.length)
      const prompt = compactBatch
        ? buildCompactAutoReplyPrompt(selectedEvents)
        : buildAutoReplyPrompt(primaryEvent, { shortReply: shortReplyMode })
      const automationRequest: ChatAutomationRequest = {
        replyStyle: compactBatch ? "compact" : shortReplyMode ? "short" : "default",
        source: "platform_auto_reply",
        target: {
          platform: primaryEvent.platform,
          target: primaryEvent.target,
        },
      }
      const retryKey = buildAutoReplyRetryKey(selectedEvents)
      const abortController = new AbortController()
      const preparedSequence = preparedAutoReplySequenceRef.current++
      autoReplyGenerationAbortControllersRef.current.add(abortController)

      if (compactBatch) {
        setRuntimeProgress((current) =>
          appendRuntimeActivity(current, {
            detail: `${selectedEvents.length}件のコメント候補から、AI に今いちばん拾う返答を選ばせます。`,
            kind: "autoreply",
            label: "コメント候補を AI 採択中",
            status: "running",
          }),
        )
      }

      void (async () => {
        try {
          const {
            action,
            automationEnvelope,
            finalEmotion,
            emotionPayload,
            latestRunRecap,
            moderation,
            providerMetadata,
            responseText,
            sessionMetadata,
          } = await generatePromptResponse(
            prompt,
            recentTurnsRef.current,
            abortController.signal,
            automationRequest,
          )
          if (providerMetadata) {
            setProviderMetadata(providerMetadata)
          }
          if (sessionMetadata) {
            setSessionMetadata(sessionMetadata)
          }
          if (emotionPayload) {
            setFinalEmotionPayload(emotionPayload)
          }
          if (latestRunRecap) {
            setLatestRunRecap(latestRunRecap)
          }
          setLatestAutomationEnvelope(automationEnvelope)
          if (moderation) {
            setLatestModeration(moderation)
          }
          appendRecentTurns(prompt, responseText)
          const preparedReply: PreparedAutoReply = {
            action,
            finalEmotion,
            id: retryKey,
            isMonetized: selectedEvents.some((event) => event.isMonetized),
            moderation,
            responseText,
            sequence: preparedSequence,
            source: "viewer",
          }

          if (shouldAutoPlayPreparedReply(preparedReply)) {
            enqueuePreparedAutoReply(preparedReply)
            void pumpPreparedAutoReplyQueue()
          }
        } catch (error) {
          if (!abortController.signal.aborted && !isAbortError(error)) {
            scheduleAutoReplyRetry(
              selectedEvents,
              error instanceof Error ? error.message : "コメント返答の生成に失敗しました。",
            )
          }
        } finally {
          autoReplyGenerationAbortControllersRef.current.delete(abortController)
          autoReplyGenerationCountRef.current = Math.max(0, autoReplyGenerationCountRef.current - 1)

          if (autoReplyEnabledRef.current && autoReplyEventQueueRef.current.length > 0) {
            void pumpAutoReplyGenerationQueue()
          }
        }
      })()
    }
  }

  async function pumpPreparedAutoReplyQueue() {
    if (
      !autoReplyEnabledRef.current ||
      abortRef.current ||
      preparedAutoReplyPlaybackBusyRef.current
    ) {
      return
    }

    const nextReply = preparedAutoReplyQueueRef.current.shift()

    if (!nextReply) {
      return
    }

    preparedAutoReplyPlaybackBusyRef.current = true

    try {
      await playPreparedAutoReply(nextReply)
    } finally {
      preparedAutoReplyPlaybackBusyRef.current = false

      if (
        autoReplyEnabledRef.current &&
        !abortRef.current &&
        preparedAutoReplyQueueRef.current.length > 0
      ) {
        void pumpPreparedAutoReplyQueue()
      }
    }
  }

  async function playPreparedAutoReply(reply: PreparedAutoReply) {
    const normalizedResponse = reply.responseText.trim()
    const replyStartedAt = performance.now()

    if (!normalizedResponse) {
      if (autoReplyEnabledRef.current) {
        void pumpPreparedAutoReplyQueue()
      }
      return
    }

    const abortController = new AbortController()
    abortRef.current = abortController
    setResponseText(normalizedResponse)
    setCaptionText(normalizedResponse)
    clearError()
    setEmotion("neutral")
    setStatus(voiceEnabled ? "synthesizing" : "ready")
    setAvatarState(voiceEnabled ? "thinking" : "idle")
    resetAvatarMouth()
    setRuntimeProgress(
      appendRuntimeActivity(createIdleRuntimeProgress(), {
        detail: "ライブコメントから用意した返答です。",
        kind: "autoreply",
        label: "自動返答を再生します",
        status: voiceEnabled ? "synthesizing" : "done",
      }),
    )

    if (!voiceEnabled) {
      setCaptionText(normalizedResponse)
      setEmotion(reply.finalEmotion ?? "neutral")
      setRuntimeProgress((current) => finalizeRuntimeProgress(current))

      if (abortRef.current === abortController) {
        abortRef.current = null
      }

      if (autoReplyEnabledRef.current) {
        void pumpPreparedAutoReplyQueue()
      }
      return
    }

    let synthesisTail = Promise.resolve()
    let playbackPromise: Promise<void> | null = null
    let playbackActive = false
    let pendingSynthesisCount = 0
    let speechError: Error | null = null
    let firstAudioObserved = false
    const audioQueue: Array<{ blob: Blob; emotion: Emotion; text: string }> = []

    const canUpdateSpeechState = () => !speechError && !abortController.signal.aborted

    const handleSpeechError = (error: unknown) => {
      if (abortController.signal.aborted) {
        return
      }

      speechError = error instanceof Error ? error : new Error("VOICEVOX音声の処理に失敗しました。")
      const speechErrorMessage = speechError.message
      audioQueue.length = 0
      showError(speechErrorMessage)
      setEmotion("neutral")
      setStatus("error")
      setAvatarState("error")
      resetAvatarMouth()
      setRuntimeProgress((current) =>
        appendRuntimeActivity(current, {
          detail: speechErrorMessage,
          kind: "voice",
          label: "自動返答の読み上げに失敗しました",
          status: "error",
        }),
      )
      abortController.abort()
    }

    const finalizeIfDone = () => {
      if (abortController.signal.aborted || playbackActive || pendingSynthesisCount > 0) {
        return
      }

      if (speechError) {
        setStatus("error")
        setAvatarState("error")
        resetAvatarMouth()
        return
      }

      setCaptionText(normalizedResponse)
      setStatus("ready")
      setEmotion(reply.finalEmotion ?? "neutral")
      setAvatarState("idle")
      resetAvatarMouth()
      setRuntimeProgress((current) => finalizeRuntimeProgress(current))
    }

    const startPlaybackIfNeeded = () => {
      if (playbackActive || audioQueue.length === 0 || abortController.signal.aborted) {
        return
      }

      playbackActive = true
      playbackPromise = (async () => {
        let hasPlayedSegment = false

        try {
          while (audioQueue.length > 0 && !abortController.signal.aborted) {
            const next = audioQueue.shift()

            if (!next) {
              continue
            }

            if (hasPlayedSegment) {
              await waitForQueuedPlaybackGap(abortController.signal)
            }

            await playAudioBlob(next.blob, {
              onAnalysis: handleMotionPngAnalysis,
              text: next.text,
              signal: abortController.signal,
              onStart: () => {
                if (canUpdateSpeechState()) {
                  if (!firstAudioObserved) {
                    firstAudioObserved = true
                    const latencyMs = Math.round(performance.now() - replyStartedAt)
                    setRuntimeProgress((current) =>
                      appendRuntimeActivity(current, {
                        detail: `${latencyMs}ms で再生を開始しました。`,
                        kind: "latency",
                        label: "返答初動を計測しました",
                        status: "done",
                      }),
                    )
                  }
                  setCaptionText(next.text)
                  setEmotion(next.emotion)
                  setStatus("playing")
                  setAvatarState("speaking")
                }
              },
              onViseme: setViseme,
              onEnded: () => {
                if (canUpdateSpeechState()) {
                  resetAvatarMouth()
                }
              },
              onError: handleSpeechError,
            })
            hasPlayedSegment = true
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

      if (!normalizedSegment) {
        return
      }

      const segmentEmotion = inferEmotionFromText(normalizedSegment)
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
          audioQueue.push({ blob: wav, emotion: segmentEmotion, text: normalizedSegment })
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
      const { segments } = extractSpeechSegments(normalizedResponse, { force: true })
      segments.forEach(enqueueSpeechSegment)
      await synthesisTail

      if (playbackPromise) {
        await playbackPromise
      }

      finalizeIfDone()
    } finally {
      if (abortRef.current === abortController) {
        abortRef.current = null
      }

      if (autoReplyEnabledRef.current) {
        void pumpPreparedAutoReplyQueue()
      }
    }
  }

  const visibleError = errorMessage && errorMessage !== dismissedError ? errorMessage : null
  const autoContentSessionBase = autoReplyEnabled
    ? platformState.status === "connected"
      ? `${platformState.mode ?? "chat"}:${platformState.target ?? "default"}`
      : "autopilot"
    : null
  const contentSurface = useMemo(
    () =>
      deriveCharacterContentSurface({
        finalEmotion: finalEmotionPayload,
        latestRunRecap,
        liveViewerEvents,
        providerMetadata,
        recentTurns,
        responseText,
        sessionMetadata,
      }),
    [finalEmotionPayload, latestRunRecap, liveViewerEvents, providerMetadata, recentTurns, responseText, sessionMetadata],
  )
  const nextAutomaticContentCandidate = useMemo(
    () =>
      selectAutomaticContentSuggestion({
        contentSurface,
        liveViewerEvents,
        platformState,
        recentTurns,
        sequence: autoContentSequenceRef.current,
        sessionKey: autoContentSessionBase,
        usedViewerEventIds: autoContentExpandedViewerEventsRef.current,
      }),
    [autoContentSessionBase, autoReplyEnabled, contentSurface, liveViewerEvents, platformState, recentTurns],
  )
  const runtimeDisplay = describeRuntimeDisplay(status, runtimeProgress, visibleError, {
    autoReplyEnabled,
    nextAutomaticContentCandidate,
    platformState,
    recentViewerEventCount: liveViewerEvents.length,
  })
  const isBusy = status === "thinking" || status === "synthesizing" || status === "playing"

  useEffect(() => {
    if (
      !autoReplyEnabled ||
      (status !== "ready" && status !== "synthesizing" && status !== "playing") ||
      autoContentBusyRef.current ||
      preparedAutoReplyQueueRef.current.length > 0
    ) {
      autoContentScheduledKeyRef.current = null
      return
    }

    if (!nextAutomaticContentCandidate) {
      autoContentScheduledKeyRef.current = null
      return
    }

    const candidateKey = `${nextAutomaticContentCandidate.suggestion.id}:${nextAutomaticContentCandidate.anchor}`

    if (autoContentScheduledKeyRef.current === candidateKey) {
      return
    }

    autoContentScheduledKeyRef.current = candidateKey
    const delayMs =
      status === "ready" ? automaticContentDelay(nextAutomaticContentCandidate) : AUTO_CONTENT_PREFETCH_DELAY_MS
    const timeoutId = window.setTimeout(() => {
      if (autoContentScheduledKeyRef.current === candidateKey) {
        autoContentScheduledKeyRef.current = null
      }

      void triggerAutomaticContentSuggestion(nextAutomaticContentCandidate, candidateKey)
    }, delayMs)

    return () => {
      window.clearTimeout(timeoutId)

      if (autoContentScheduledKeyRef.current === candidateKey) {
        autoContentScheduledKeyRef.current = null
      }
    }
  }, [
    autoReplyEnabled,
    nextAutomaticContentCandidate,
    status,
  ])

  return (
    <>
      <section
        className={`stage${dockOpen ? " stage--dock-open" : ""}${stageBackgroundMedia ? " stage--custom-background" : ""}`}
        aria-label="配信用アバターステージ"
      >
        {stageBackgroundMedia?.kind === "image" && (
          <img
            aria-hidden="true"
            alt=""
            className="stage__custom-background"
            src={stageBackgroundMedia.url}
          />
        )}
        {stageBackgroundMedia?.kind === "video" && (
          <video
            aria-hidden="true"
            autoPlay
            className="stage__custom-background stage__custom-background--video"
            loop
            muted
            playsInline
            src={stageBackgroundMedia.url}
          />
        )}
        <div className="stage__backdrop" aria-hidden="true" />
        <div className="stage__grid" aria-hidden="true" />
        <div className="stage__horizon" aria-hidden="true" />
        <div className="stage__aura" aria-hidden="true" />
        <div className="stage__avatar-shell">
          <div className="stage__avatar">
            {avatarMode === "motionpng" ? (
              <MotionPngAvatar
                assetFiles={motionPngFiles}
                onAssetStatusChange={handleMotionPngAssetStatusChange}
                ref={motionPngAvatarRef}
                settings={motionPngSettings}
                state={avatarState}
              />
            ) : (
              <MaidCatAvatar emotion={emotion} state={avatarState} viseme={viseme} />
            )}
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
        <button
          className={`topbar__mode-btn${streamScreenMode ? " topbar__mode-btn--active" : ""}`}
          type="button"
          onClick={() => handleStreamScreenModeChange(!streamScreenMode)}
        >
          {streamScreenMode ? "配信画面中" : "配信画面"}
        </button>
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
          <div className="caption__meta">
            <p className="caption__label">
              <span className="caption__live" aria-hidden="true" />
              LIVE CAPTION
            </p>
            <div className="caption__runtime">
              <span className={`runtime-chip runtime-chip--${runtimeDisplay.tone}`}>
                {runtimeDisplay.label}
              </span>
              {runtimeDisplay.detail && <span className="caption__runtime-detail">{runtimeDisplay.detail}</span>}
            </div>
          </div>
          <span className={`status-pill status-pill--${status}`}>{stageStatusLabel[status]}</span>
        </div>
        <p className={`caption__text${captionText ? "" : " caption__text--placeholder"}`}>
          {captionText || characterProfile.idleCaption}
        </p>
      </section>

      {streamScreenMode && (
        <section className="viewer-overlay" aria-label="受信コメントオーバーレイ">
          <div className="viewer-overlay__card">
            <div className="viewer-overlay__head">
              <p className="viewer-overlay__label">LIVE COMMENTS</p>
              <div className="viewer-overlay__badges">
                <span className="viewer-overlay__count">{liveViewerEvents.length}件</span>
                <span className={`viewer-overlay__status viewer-overlay__status--${platformState.status}`}>
                {platformState.status === "connected"
                  ? `${platformState.mode ?? "chat"} 接続中`
                  : platformState.status === "connecting"
                    ? "接続中..."
                    : platformState.status === "error"
                      ? "接続エラー"
                      : "未接続"}
                </span>
              </div>
            </div>
            <ViewerEventFeed events={liveViewerEvents} />
          </div>
        </section>
      )}

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
          onClick={() => {
            setStreamScreenMode(false)
            setDockOpen(true)
          }}
          aria-label="操作ドックを開く"
        >
          <span aria-hidden="true">💬</span>
          <span>操作</span>
        </button>
      )}

      <input
        ref={stageBackgroundInputRef}
        accept="image/*,video/*"
        hidden
        onChange={handleStageBackgroundChange}
        type="file"
      />

      <input
        ref={motionPngFolderInputRef}
        hidden
        multiple
        onChange={handleMotionPngFolderChange}
        type="file"
      />

      <ControlDock
        avatarMode={avatarMode}
        backgroundAssetKind={stageBackgroundMedia?.kind ?? null}
        backgroundAssetLabel={stageBackgroundMedia?.name ?? null}
        open={dockOpen}
        onClose={() => {
          setDockOpen(false)
        }}
        onAvatarModeChange={setAvatarMode}
        onBackgroundClear={handleStageBackgroundClear}
        onBackgroundSelect={handleStageBackgroundSelect}
        onMotionPngClear={handleMotionPngClear}
        onMotionPngFolderSelect={handleMotionPngFolderSelect}
        onMotionPngSettingChange={updateMotionPngSettings}
        onStreamScreenModeChange={handleStreamScreenModeChange}
        errorMessage={errorMessage}
        onCancel={handleCancel}
        onSubmit={handlePrompt}
        responseText={responseText}
        runtimeActivities={runtimeProgress.activities}
        runtimeDetail={runtimeDisplay.detail}
        runtimeLabel={runtimeDisplay.label}
        runtimeTone={runtimeDisplay.tone}
        status={status}
        voiceEnabled={voiceEnabled}
        voicevoxHealth={voicevoxHealth}
        contentSurface={contentSurface}
        platformMode={platformMode}
        platformTarget={platformTarget}
        platformState={platformState}
        liveViewerEvents={liveViewerEvents}
        latestModeration={latestModeration}
        latestAutomationPolicy={latestAutomationEnvelope?.policy ?? platformState.automationPolicy}
        autoReplyEnabled={autoReplyEnabled}
        motionPngAssetStatus={motionPngAssetStatus}
        motionPngFolderLabel={motionPngFolderLabel}
        motionPngSettings={motionPngSettings}
        streamScreenMode={streamScreenMode}
        onAutoReplyEnabledChange={setAutoReplyEnabled}
        onPlatformModeChange={setPlatformMode}
        onPlatformStart={handlePlatformStart}
        onPlatformStop={handlePlatformStop}
        onPlatformTargetChange={setPlatformTarget}
        onUseContentSuggestion={handlePrompt}
        onVoiceEnabledChange={setVoiceEnabled}
      />
    </>
  )
}

function trimRecentTurns(turns: ConversationTurn[]) {
  return turns.slice(-8)
}

function deriveMotionPngFolderLabel(files: File[]) {
  const firstPath = files[0]?.webkitRelativePath
  if (firstPath) {
    const [folderName] = firstPath.split(/[\\/]/)
    if (folderName) {
      return folderName
    }
  }

  return "MotionPNGTuber フォルダ"
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

async function generatePromptResponse(
  prompt: string,
  recentTurns: ConversationTurn[],
  signal: AbortSignal,
  automation?: ChatAutomationRequest,
) {
  let action: AutomationAction | null = null
  let automationEnvelope: AutomationEnvelope | null = null
  let finalEmotion: Emotion | null = null
  let emotionPayload: FinalEmotionPayload | null = null
  let fullResponseText = ""
  let latestRunRecap: ChatRunRecap | null = null
  let moderation: ModerationAssessment | null = null
  let providerMetadata: ChatMetadataPayload | null = null
  let sessionMetadata: ChatSessionPayload | null = null

  for await (const event of streamAiResponse({
    automation,
    prompt,
    recentTurns,
    signal,
  })) {
    if (event.type === "automation") {
      automationEnvelope = event.payload
      action = event.payload.actions[0] ?? null
    }

    if (event.type === "text") {
      fullResponseText += event.text
    }

    if (event.type === "moderation") {
      moderation = event.payload
    }

    if (event.type === "metadata") {
      providerMetadata = event.payload
    }

    if (event.type === "session") {
      sessionMetadata = event.payload
    }

    if (event.type === "emotion") {
      finalEmotion = event.payload.emotion
      emotionPayload = event.payload
    }

    if (event.type === "meta" && isChatRunRecap(event.meta.raw)) {
      latestRunRecap = event.meta.raw
    }

    if (event.type === "error") {
      throw new Error(event.message)
    }
  }

  const normalizedResponse = fullResponseText.trim()

  if (!normalizedResponse) {
    throw new Error("AI から空の応答が返りました。")
  }

  return {
    action,
    automationEnvelope,
    emotionPayload,
    finalEmotion,
    latestRunRecap,
    moderation,
    providerMetadata,
    responseText: normalizedResponse,
    sessionMetadata,
  }
}

function buildAutoReplyPrompt(
  event: PlatformViewerEvent,
  options?: {
    shortReply?: boolean
  },
) {
  const monetizationText = event.monetization?.amountText ? ` / ${event.monetization.amountText}` : ""
  const eventKindLabel = describeEventKind(event)
  const replyInstruction = options?.shortReply
    ? "Catlin本人として、そのまま配信で話す感じで、1〜2文の短い返事をすぐ返してください。"
    : "Catlin本人として、そのまま配信で話す感じで自然に返事してください。"

  return [
    `配信中の視聴者コメントです。${event.authorName}さんが ${event.platform} で送ってくれました。`,
    `種別: ${eventKindLabel}${monetizationText}`,
    `コメント: ${event.text}`,
    replyInstruction,
  ].join("\n")
}

function buildCompactAutoReplyPrompt(events: PlatformViewerEvent[]) {
  return [
    "配信中に続けて届いた複数の視聴者コメントです。",
    "全部に均等に返さなくてよいですが、圧縮しすぎず、主軸1件に加えて近い話題ならもう1件まで自然に拾ってください。",
    "無理に全部をまとめず、拾ったコメントの内容がちゃんと残る返しにしてください。",
    "Catlin本人として、そのまま配信で話せる返答を1〜3文で返してください。",
    ...events.map((event) => `- ${event.authorName}: ${event.text}`),
  ].join("\n")
}

function shouldUseShortAutoReplyMode(queueDepth: number) {
  return queueDepth >= 3
}

function takeCompactViewerReplyBatch(queue: PlatformViewerEvent[]) {
  const first = queue[0]

  if (!first || first.isMonetized || first.kind !== "comment" || queue.length < COMPACT_REPLY_TRIGGER_COUNT) {
    return null
  }

  const candidates = queue.filter((event) => !event.isMonetized && event.kind === "comment").slice(0, COMPACT_REPLY_BATCH_SIZE)
  return candidates.length >= COMPACT_REPLY_TRIGGER_COUNT ? candidates : null
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

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError"
}

function waitForQueuedPlaybackGap(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"))
      return
    }

    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort)
      resolve()
    }, QUEUED_PLAYBACK_GAP_MS)

    const handleAbort = () => {
      window.clearTimeout(timeoutId)
      signal.removeEventListener("abort", handleAbort)
      reject(new DOMException("The operation was aborted.", "AbortError"))
    }

    signal.addEventListener("abort", handleAbort, { once: true })
  })
}

function automaticContentDelay(candidate: AutomaticContentCandidate) {
  if (candidate.source === "opening") {
    return AUTO_CONTENT_OPENING_DELAY_MS
  }

  if (candidate.source === "viewer") {
    return AUTO_CONTENT_VIEWER_FOLLOWUP_DELAY_MS
  }

  switch (candidate.suggestion.id) {
    case "mini-corner":
      return AUTO_CONTENT_MINI_CORNER_DELAY_MS
    case "recap":
      return AUTO_CONTENT_RECAP_DELAY_MS
    case "teaser":
      return AUTO_CONTENT_TEASER_DELAY_MS
    case "opening":
      return AUTO_CONTENT_OPENING_DELAY_MS
  }
}

function selectAutomaticContentSuggestion(options: {
  contentSurface: CharacterContentSurface
  liveViewerEvents: PlatformViewerEvent[]
  platformState: PlatformChatState
  recentTurns: ConversationTurn[]
  sequence: number
  sessionKey: string | null
  usedViewerEventIds: Set<string>
}): AutomaticContentCandidate | null {
  if (!options.sessionKey) {
    return null
  }

  const latestViewerEvent =
    options.liveViewerEvents.find((event) => assessViewerEventTriage(event).action === "queue") ?? null
  const assistantTurns = options.recentTurns.filter((turn) => turn.role === "assistant")
  const latestAssistantTurn = assistantTurns[assistantTurns.length - 1] ?? null
  const suggestions = new Map(options.contentSurface.suggestions.map((suggestion) => [suggestion.id, suggestion]))

  if (!latestAssistantTurn) {
    const opening = suggestions.get("opening")

    if (opening) {
      return {
        anchor: `${options.sessionKey}:opening`,
        reason: "配信開始直後なので、最初の一声を自動で整えます。",
        source: "opening",
        suggestion: opening,
      }
    }
  }

  if (latestViewerEvent && !options.usedViewerEventIds.has(latestViewerEvent.id)) {
    const miniCorner = suggestions.get("mini-corner")

    if (miniCorner) {
      return {
        anchor: `${options.sessionKey}:viewer:${latestViewerEvent.id}`,
        reason: `${latestViewerEvent.authorName}さんのコメントから、短いネタ面を自動で広げます。`,
        source: "viewer",
        suggestion: miniCorner,
        viewerEventId: latestViewerEvent.id,
      }
    }
  }

  const nextSuggestionId = selectAutopilotSuggestionId(options.sequence, assistantTurns.length)
  const nextSuggestion = suggestions.get(nextSuggestionId)

  if (!nextSuggestion) {
    return null
  }

  return {
    anchor: `${options.sessionKey}:sequence:${options.sequence}`,
      reason:
        nextSuggestion.id === "recap"
          ? "いまの流れを一度まとめて、次の雑談へつなぎます。"
          : nextSuggestion.id === "teaser"
            ? "次に広げる話題を先回りで差し込み、配信の流れを保ちます。"
            : latestViewerEvent && options.platformState.status === "connected"
              ? "コメントを拾い続けながら、流れを切らさないよう小ネタへ広げます。"
              : "コメントが無くても止まらないよう、自走トークを次へ進めます。",
    source: "autopilot",
    suggestion: nextSuggestion,
  }
}

function selectAutopilotSuggestionId(
  sequence: number,
  assistantTurnCount: number,
): CharacterContentSuggestion["id"] {
  const cycle: CharacterContentSuggestion["id"][] = ["mini-corner", "teaser", "mini-corner", "recap"]
  const candidate = cycle[sequence % cycle.length] ?? "mini-corner"

  if (candidate === "teaser" && assistantTurnCount < 2) {
    return "mini-corner"
  }

  if (candidate === "recap" && assistantTurnCount < 3) {
    return "mini-corner"
  }

  return candidate
}

function assessViewerEventTriage(event: PlatformViewerEvent): ViewerEventTriageDecision {
  if (event.moderation.disposition === "block") {
    return {
      action: "skip",
      reason: "moderation により block 判定でした。",
      score: -99,
    }
  }

  if (event.isMonetized || event.kind !== "comment") {
    return {
      action: "queue",
      reason: "課金・特別イベントなので優先して返します。",
      score: 10,
    }
  }

  const normalized = normalizeViewerEventText(event.text)

  if (!normalized) {
    return {
      action: "skip",
      reason: "内容が薄く、返答軸を作りにくい短文です。",
      score: -5,
    }
  }

  let score = 0
  const reasons: string[] = []

  if (looksLikeAckComment(normalized)) {
    score -= 1
    reasons.push("相槌・リアクション寄り")
  }

  if (looksLikeLaughterOnly(normalized)) {
    score -= 1
    reasons.push("笑い・スタンプ寄り")
  }

  if (containsQuestionCue(normalized)) {
    score += 3
    reasons.push("質問系")
  }

  if (containsReplyWorthyCue(normalized)) {
    score += 2
    reasons.push("話題を広げやすい")
  }

  if (containsSupportiveSpecificity(normalized)) {
    score += 1
    reasons.push("感想に具体性あり")
  }

  if (normalized.length >= 20) {
    score += 1
    reasons.push("情報量あり")
  }

  if (event.moderation.disposition === "review") {
    score -= 1
    reasons.push("review 判定")
  }

  return score >= 2
    ? {
        action: "queue",
        reason: reasons.join(" / "),
        score,
      }
    : {
        action: "queue",
        reason: reasons[0] ?? "優先度は低めですが、候補として保持します。",
        score,
      }
}

function insertQueuedViewerEvent(queue: PlatformViewerEvent[], event: PlatformViewerEvent) {
  return [...queue.filter((item) => item.id !== event.id), event]
    .sort(compareQueuedViewerEvents)
    .slice(0, MAX_QUEUED_VIEWER_EVENTS)
}

function compareQueuedViewerEvents(a: PlatformViewerEvent, b: PlatformViewerEvent) {
  if (a.isMonetized !== b.isMonetized) {
    return a.isMonetized ? -1 : 1
  }

  const scoreDelta = assessViewerEventTriage(b).score - assessViewerEventTriage(a).score

  if (scoreDelta !== 0) {
    return scoreDelta
  }

  return Date.parse(a.receivedAt) - Date.parse(b.receivedAt)
}

function normalizeViewerEventText(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
}

function looksLikeAckComment(text: string) {
  return /^(うん|はい|ほい|おk|ok|なるほど|たしかに|せやな|そうだね|そう|ほんと|ほんま|いいね|いいかも|わかる|えらい|すごい|かわいい|助かる|ありがとう|草)$/.test(
    text,
  )
}

function looksLikeLaughterOnly(text: string) {
  return /^[wｗ笑草👏🙏✨⭐️⭐🤣😂😹😺!?！？…]+$/.test(text)
}

function containsQuestionCue(text: string) {
  return /[?？]|(なに|何|どう|なんで|なぜ|どれ|どっち|教えて|聞きたい|おすすめ|好き)/.test(text)
}

function containsReplyWorthyCue(text: string) {
  return /(やって|見たい|してほしい|話して|相談|気になる|初見|こんばんは|おはよう|ただいま|いまきた|配信)/.test(
    text,
  )
}

function containsSupportiveSpecificity(text: string) {
  return /(声|衣装|表情|話し方|トーク|今日|さっき|今の|その話|その流れ|雰囲気)/.test(text)
}
