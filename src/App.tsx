import { type ChangeEvent, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, X } from "lucide-react"
import {
  type AutomationAction,
  type AutomationEnvelope,
  type ChatAutomationRequest,
} from "../shared/automation"
import type { ChatMetadataPayload, ChatSessionPayload } from "../shared/chatStream"
import { createDefaultChatSettings, type ChatSettings } from "../shared/chatSettings"
import type { AppSettings, AppUiSettings } from "../shared/appSettings"
import { createEmptyCharacterRuleStatus, type CharacterRuleStatus } from "../shared/characterRules"
import type { CharacterSinValues } from "../shared/characterState"
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
import { OperatorConsole } from "./components/OperatorConsole"
import { StageView } from "./components/StageView"
import {
  useAutopilotScheduler,
  useScheduleAutomaticContentSuggestion,
} from "./hooks/useAutopilotScheduler"
import { useErrorToast } from "./hooks/useErrorToast"
import { useChatSettingsManager } from "./hooks/useChatSettingsManager"
import { usePersonaAutoRewrite } from "./hooks/usePersonaAutoRewrite"
import { useDopamineEngine } from "./hooks/useDopamineEngine"
import { DopamineEffects } from "./components/DopamineEffects"
import { useStageBackgroundMedia, type StageBackgroundMedia } from "./hooks/useStageBackgroundMedia"
import { useAudioOutputDevices } from "./hooks/useAudioOutputDevices"
import { useVoicevoxHealthProbe } from "./hooks/useVoicevoxHealthProbe"
import { type AvatarState } from "./components/MaidCatAvatar"
import { type MotionPngAvatarHandle } from "./components/MotionPngAvatar"
import { playAudioBlob } from "./lib/audioPlayback"
import {
  defaultMotionPngAssetStatus,
  defaultMotionPngSettings,
  type AvatarMode,
  type MotionPngAssetStatus,
  type MotionPngAudioAnalysis,
  type MotionPngSettings,
  type SvgAvatarSettings,
  type SvgCharacterId,
} from "./lib/avatarConfig"
import { deriveCharacterContentSurface } from "./lib/contentSurface"
import { inferEmotionFromText } from "./lib/emotion"
import { inferQuickEmotion } from "../shared/dopamineMutation"
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
import {
  buildPreparedReplySignature,
  dequeuePreparedReply,
  enqueuePreparedReply,
  shouldAutoPlayPreparedReply,
  type PreparedAutoReply,
} from "./lib/preparedReplyQueue"
import { fetchRuntimeStatus, isChatRunRecap, normalizeCharacterRuleStatus, type ChatRunRecap } from "./lib/runtimeStatus"
import type { Viseme } from "./lib/visemes"
import { synthesizeVoice } from "./lib/voicevox"
import { requestAutopilotTopic } from "./lib/autopilot"
import { requestLiveMutation, requestHeavyMutation } from "./lib/liveSelfRewrite"
import {
  AUTO_REPLY_BRIDGE_DELAY_MS,
  AUTO_REPLY_BRIDGE_TEXT,
  COMPACT_REPLY_BATCH_SIZE,
  COMPACT_REPLY_TRIGGER_COUNT,
  MAX_AUTO_REPLY_RETRY_ATTEMPTS,
  MAX_CONCURRENT_AUTO_REPLY_GENERATIONS,
  MAX_QUEUED_VIEWER_EVENTS,
} from "./lib/autoReplyConstants"
import {
  applyRuntimeMetadataEvent,
  applyRuntimeStateEvent,
  appendRuntimeActivity,
  createIdleRuntimeProgress,
  createPendingRuntimeProgress,
  describeRuntimeDisplay,
  finalizeRuntimeProgress,
  type StreamRuntimeProgress,
  type StreamStatus,
} from "./lib/runtimeProgress"
import { extractSpeechSegments, trimRecentTurns, waitForQueuedPlaybackGap } from "./lib/speechSegments"
import {
  assessViewerEventTriage,
  insertQueuedViewerEvent,
  insertViewerEvent,
} from "./lib/viewerEventTriage"
import {
  buildAutoReplyPrompt,
  buildCompactAutoReplyPrompt,
  shouldUseShortAutoReplyMode,
  takeCompactViewerReplyBatch,
} from "./lib/autoReplyPrompt"
import { selectAutomaticContentSuggestion } from "./lib/autopilotSelection"
import { formatRelativeTimestamp, isAbortError, readSseData } from "./lib/sseHelpers"
import { deriveMotionPngFolderLabel } from "./lib/motionPngFolder"
import { generatePromptResponse } from "./lib/generatePromptResponse"
import {
  appendRecentNoveltyScore,
  averageNoveltyScore,
  createAutopilotStalenessSnapshot,
  getAutoContentSessionBase,
  isAutopilotStale,
  type AutomaticContentCandidate,
} from "./lib/autopilotScheduler"
import { derivePlannerHints } from "../shared/plannerHints"
import {
  computeSuggestionWeights,
  describeToneDirective,
  pickWeightedSuggestion,
  type SuggestionContext,
} from "../shared/sinsBias"
import { computeSinExpressionSignal } from "../shared/sinsExpression"
import {
  defaultStageDisplayPreferences,
  loadAvatarMode,
  loadMotionPngSettings,
  loadStageBackground,
  loadStageDisplayPreferences,
  loadSvgAvatarSettings,
  loadSvgCharacter,
  stagePreferenceStorageKeys,
  type StageDisplayPreferences,
} from "./lib/stagePreferences"
import { fetchAppSettings, saveAppSettings } from "./lib/appSettings"
import type { CharacterContentSuggestion, CharacterContentSurface } from "./lib/contentSurface"

const SettingsModal = lazy(() =>
  import("./components/SettingsModal").then((module) => ({ default: module.SettingsModal })),
)

export type { RuntimeTone, StreamRuntimeActivity, StreamStatus } from "./lib/runtimeProgress"

const LOCAL_STORAGE_SETTINGS_MIGRATED_KEY = "ctk.app-settings.local-storage-migrated"

function collectLocalStorageUiSettings(): AppUiSettings | null {
  if (typeof window === "undefined") return null

  const storage = safeLocalStorage()
  if (!storage) return null

  const hasLegacyValue = Object.values(stagePreferenceStorageKeys).some((key) => storage.getItem(key) !== null)
  if (!hasLegacyValue) return null

  const savedBg = loadStageBackground()
  return {
    audioOutputDeviceId: null,
    avatarMode: loadAvatarMode() ?? "svg",
    motionPngSettings: loadMotionPngSettings(),
    stageBackground: savedBg?.kind === "preset" ? { kind: "preset", id: savedBg.id } : null,
    stageDisplay: loadStageDisplayPreferences(),
    svgAvatarSettings: loadSvgAvatarSettings(),
    svgCharacter: loadSvgCharacter(),
  }
}

function hasMigratedLocalStorageSettings() {
  return safeLocalStorage()?.getItem(LOCAL_STORAGE_SETTINGS_MIGRATED_KEY) === "1"
}

function markLocalStorageSettingsMigrated() {
  safeLocalStorage()?.setItem(LOCAL_STORAGE_SETTINGS_MIGRATED_KEY, "1")
}

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}



export function App() {
  const [avatarMode, setAvatarMode] = useState<AvatarMode>(() => loadAvatarMode() ?? "svg")
  const [avatarState, setAvatarState] = useState<AvatarState>("idle")
  const [status, setStatus] = useState<StreamStatus>("ready")
  const [responseText, setResponseText] = useState("")
  const [captionText, setCaptionText] = useState("")
  const [emotion, setEmotion] = useState<Emotion>("neutral")
  const [viseme, setViseme] = useState<Viseme>("closed")
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const voicevoxHealth = useVoicevoxHealthProbe()
  const [runtimeProgress, setRuntimeProgress] = useState<StreamRuntimeProgress>(createIdleRuntimeProgress)
  const [providerMetadata, setProviderMetadata] = useState<ChatMetadataPayload | null>(null)
  const [sessionMetadata, setSessionMetadata] = useState<ChatSessionPayload | null>(null)
  const [finalEmotionPayload, setFinalEmotionPayload] = useState<FinalEmotionPayload | null>(null)
  const [latestRunRecap, setLatestRunRecap] = useState<ChatRunRecap | null>(null)
  const [characterRuleStatus, setCharacterRuleStatus] = useState<CharacterRuleStatus>(createEmptyCharacterRuleStatus)
  const [runtimeCharacterSins, setRuntimeCharacterSins] = useState<CharacterSinValues>(
    () => createDefaultChatSettings().characterState.sins,
  )
  const [latestAutomationEnvelope, setLatestAutomationEnvelope] = useState<AutomationEnvelope | null>(null)
  const [latestModeration, setLatestModeration] = useState<ModerationAssessment | null>(null)
  const [dockOpen, setDockOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [stagePreviewOpen, setStagePreviewOpen] = useState(false)
  const [streamScreenMode, setStreamScreenMode] = useState(false)
  const [recentTurns, setRecentTurns] = useState<ConversationTurn[]>([])
  const [platformMode, setPlatformMode] = useState<PlatformChatMode>("youtube")
  const [platformTarget, setPlatformTarget] = useState("")
  const [platformState, setPlatformState] = useState<PlatformChatState>(createIdlePlatformChatState())
  const [liveViewerEvents, setLiveViewerEvents] = useState<PlatformViewerEvent[]>([])
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false)
  const [motionPngAssetStatus, setMotionPngAssetStatus] =
    useState<MotionPngAssetStatus>(defaultMotionPngAssetStatus)
  const [motionPngFiles, setMotionPngFiles] = useState<File[]>([])
  const [motionPngFolderLabel, setMotionPngFolderLabel] = useState<string | null>(null)
  const [motionPngSettings, setMotionPngSettings] = useState<MotionPngSettings>(() => loadMotionPngSettings())
  const [svgAvatarSettings, setSvgAvatarSettings] = useState<SvgAvatarSettings>(() => loadSvgAvatarSettings())
  const [svgCharacter, setSvgCharacter] = useState<SvgCharacterId>(() => loadSvgCharacter())
  const [stageBackground, setStageBackground] = useState<{ kind: "preset"; id: string } | null>(null)
  const [stageDisplayPrefs, setStageDisplayPrefs] = useState<StageDisplayPreferences>(() =>
    loadStageDisplayPreferences(),
  )
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState<string | null>(null)
  const audioOutput = useAudioOutputDevices()
  const [savedUiSettings, setSavedUiSettings] = useState<AppUiSettings | null>(null)
  const [settingsSaveBusy, setSettingsSaveBusy] = useState(false)
  const [settingsSaveNotice, setSettingsSaveNotice] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const avatarModeRef = useRef<AvatarMode>(avatarMode)
  const autoReplyEnabledRef = useRef(autoReplyEnabled)
  const liveViewerEventsRef = useRef<PlatformViewerEvent[]>([])
  const recentTurnsRef = useRef<ConversationTurn[]>([])
  const autoReplyGenerationCountRef = useRef(0)
  const autoReplyEventQueueRef = useRef<PlatformViewerEvent[]>([])
  const autoReplyRetryCountsRef = useRef<Map<string, number>>(new Map())
  const autoReplyRetryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const autoReplySeenEventIdsRef = useRef<Set<string>>(new Set())
  const autoReplySeenScopeRef = useRef<string | null>(null)
  const bridgeSpeechCacheRef = useRef<Map<string, Blob>>(new Map())
  const { clearError, dismissError, showError, visibleError } = useErrorToast()
  const {
    handleStageBackgroundChange,
    handleStageBackgroundClear,
    handleStageBackgroundPresetSelect,
    handleStageBackgroundSelect,
    stageBackgroundInputRef,
    stageBackgroundMedia,
  } = useStageBackgroundMedia({
    presetId: stageBackground?.id ?? null,
    onPresetChange: setStageBackground,
  })
  const {
    characterPresetBusy,
    characterPresetNotice,
    characterPresets,
    chatSettings,
    chatSettingsAction,
    chatSettingsNotice,
    handleChatMemoryClear,
    handleCharacterPresetCreate,
    handleCharacterPresetDelete,
    handleCharacterPresetUpdate,
    handleCharacterStateReset,
    setChatSettings,
  } = useChatSettingsManager({ showError, syncRuntimeStatus })

  async function syncRuntimeStatus(signal?: AbortSignal) {
    const snapshot = await fetchRuntimeStatus(signal)
    setLatestRunRecap(snapshot.chatRuns.recent[0] ?? null)
    setCharacterRuleStatus(normalizeCharacterRuleStatus(snapshot.characterRule))

    if (snapshot.characterStateCurrent) {
      setRuntimeCharacterSins(snapshot.characterStateCurrent)
    }
  }
  const preparedAutoReplyQueueRef = useRef<PreparedAutoReply[]>([])
  const preparedAutoReplySequenceRef = useRef(0)
  const preparedAutoReplyPlaybackBusyRef = useRef(false)
  const autoReplyGenerationAbortControllersRef = useRef<Set<AbortController>>(new Set())
  const {
    assistantTurnCountRef,
    autoContentAbortRef,
    autoContentBusyRef,
    autoContentExpandedViewerEventsRef,
    autoContentScheduledKeyRef,
    autoContentSequenceRef,
    autoContentSessionBaseRef,
    openThreadsRef,
    recentNoveltyScoresRef,
    turnsSinceChapterBreakRef,
    resetAutopilotSession,
    syncAutopilotRecentTurns,
  } = useAutopilotScheduler()
  const motionPngAvatarRef = useRef<MotionPngAvatarHandle | null>(null)
  const motionPngFolderInputRef = useRef<HTMLInputElement | null>(null)
  const {
    handlePersonaAutoRewriteRequest,
    handlePersonaAutoRewriteTick,
    personaAutoRewriteBusy,
    personaAutoRewriteNotice,
    personaAutoRewriteUpdatedAt,
  } = usePersonaAutoRewrite({
    recentTurnsRef,
    runtimeCharacterSins,
    setChatSettings,
    showError,
    syncRuntimeStatus,
  })
  const dopamine = useDopamineEngine()

  useEffect(() => {
    if (typeof document === "undefined") return
    document.body.classList.toggle("dock-open", dockOpen)
  }, [dockOpen])

  // Auto-switch background preset on dopamine mutation
  useEffect(() => {
    const presetId = dopamine.state.visual.backgroundPresetId
    if (presetId && stageBackgroundMedia?.kind !== "image" && stageBackgroundMedia?.kind !== "video") {
      setStageBackground({ kind: "preset", id: presetId })
    }
  }, [dopamine.state.visual.backgroundPresetId])

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
    const abortController = new AbortController()

    syncRuntimeStatus(abortController.signal).catch(() => {
      // ignore initial runtime status failures
    })

    return () => abortController.abort()
  }, [])

  // Heavy mutation auto-trigger every 2 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      if (dopamine.isHeavyMutationReady() && Math.random() < 0.5) {
        void triggerHeavyPersonaMutation()
      }
    }, 2 * 60 * 1000)
    return () => clearInterval(interval)
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

  function updateSvgAvatarSettings(patch: Partial<SvgAvatarSettings>) {
    setSvgAvatarSettings((current) => ({ ...current, ...patch }))
  }

  function updateStageDisplayPrefs(patch: Partial<StageDisplayPreferences>) {
    setStageDisplayPrefs((current) => ({ ...current, ...patch }))
  }

  function collectCurrentUiSettings(): AppUiSettings {
    return {
      audioOutputDeviceId,
      avatarMode,
      motionPngSettings,
      stageBackground,
      stageDisplay: stageDisplayPrefs,
      svgAvatarSettings,
      svgCharacter,
    }
  }

  function applyUiSettings(settings: AppUiSettings) {
    setAudioOutputDeviceId(settings.audioOutputDeviceId)
    setAvatarMode(settings.avatarMode)
    setMotionPngSettings(settings.motionPngSettings)
    setStageBackground(settings.stageBackground)
    setStageDisplayPrefs(settings.stageDisplay)
    setSvgAvatarSettings(settings.svgAvatarSettings)
    setSvgCharacter(settings.svgCharacter)
  }

  async function triggerLivePersonaMutation(cueText?: string, _receivedAt?: string) {
    if (!dopamine.isHeavyMutationReady()) return
    dopamine.setLiveMutationBusy(true)
    try {
      const emotion = cueText ? inferQuickEmotion(cueText) : undefined
      const result = await requestLiveMutation({
        cueText,
        cueEmotion: emotion,
      })
      setChatSettings({
        ...chatSettings,
        characterPrompt: result.settings.characterPrompt,
        characterFullPrompt: result.settings.characterFullPrompt,
      })
      dopamine.pushPersonaMutation({
        id: crypto.randomUUID(),
        previousPrompt: chatSettings.characterPrompt,
        nextPrompt: result.settings.characterPrompt,
        summary: result.summary,
        monologue: result.monologue,
        cue: {
          kind: cueText ? "comment_keyword" : "manual",
          text: cueText,
          emotionTag: emotion,
          intensity: 0.7,
          receivedAt: new Date().toISOString(),
        },
        appliedAt: new Date().toISOString(),
        partial: false,
      })
      // Auto-enqueue the monologue for speech if voice is enabled
      if (voiceEnabled && result.monologue) {
        void runPrompt(result.monologue, { interruptCurrent: false })
      }
    } catch (error) {
      console.warn("[liveMutation] failed:", error)
    } finally {
      dopamine.setLiveMutationBusy(false)
    }
  }

  async function triggerHeavyPersonaMutation(cueText?: string) {
    if (!dopamine.isHeavyMutationReady()) return
    dopamine.setLiveMutationBusy(true)
    try {
      const result = await requestHeavyMutation({ cueText })
      setChatSettings({
        ...chatSettings,
        characterPrompt: result.settings.characterPrompt,
        characterFullPrompt: result.settings.characterFullPrompt,
      })
      dopamine.pushPersonaMutation({
        id: crypto.randomUUID(),
        previousPrompt: chatSettings.characterPrompt,
        nextPrompt: result.settings.characterPrompt,
        summary: result.summary,
        monologue: result.monologue,
        cue: {
          kind: cueText ? "comment_keyword" : "autopilot_boredom",
          text: cueText,
          intensity: 1.0,
          receivedAt: new Date().toISOString(),
        },
        appliedAt: new Date().toISOString(),
        partial: false,
      })
      // Stronger visual effect for heavy mutation
      dopamine.triggerManualCue("surprised")
      if (voiceEnabled && result.monologue) {
        void runPrompt(result.monologue, { interruptCurrent: false })
      }
    } catch (error) {
      console.warn("[heavyMutation] failed:", error)
    } finally {
      dopamine.setLiveMutationBusy(false)
    }
  }

  async function handleAllSettingsSave(nextChatSettings: ChatSettings) {
    setSettingsSaveBusy(true)
    setSettingsSaveNotice(null)

    try {
      const currentUi = collectCurrentUiSettings()
      const saved = await saveAppSettings({
        chatSettings: nextChatSettings,
        schemaVersion: 1,
        ui: currentUi,
      })
      setChatSettings(saved.chatSettings)
      applyUiSettings(saved.ui)
      setSavedUiSettings(saved.ui)
      setSettingsSaveNotice("設定を保存しました。")
      void syncRuntimeStatus()
    } catch (error) {
      showError(error instanceof Error ? error.message : "設定の保存に失敗しました。")
    } finally {
      setSettingsSaveBusy(false)
    }
  }

  function handleSettingsDiscard() {
    if (!savedUiSettings) return
    applyUiSettings(savedUiSettings)
    setSettingsSaveNotice("未保存の変更を破棄しました。")
  }

  useEffect(() => {
    const abortController = new AbortController()

    fetchAppSettings(abortController.signal)
      .then(async (settings) => {
        if (abortController.signal.aborted) return

        const localUi = collectLocalStorageUiSettings()
        const shouldMigrateLocalStorage = localUi !== null && !hasMigratedLocalStorageSettings()
        const effectiveSettings: AppSettings = shouldMigrateLocalStorage
          ? {
              ...settings,
              ui: localUi,
            }
          : settings

        setChatSettings(effectiveSettings.chatSettings)
        applyUiSettings(effectiveSettings.ui)
        setSavedUiSettings(effectiveSettings.ui)

        if (shouldMigrateLocalStorage) {
          const saved = await saveAppSettings(effectiveSettings, abortController.signal)
          setChatSettings(saved.chatSettings)
          applyUiSettings(saved.ui)
          setSavedUiSettings(saved.ui)
          markLocalStorageSettingsMigrated()
        }
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          showError(error instanceof Error ? error.message : "設定の取得に失敗しました。")
        }
      })

    return () => abortController.abort()
  }, [setChatSettings, showError])

  useEffect(() => {
    if (typeof window === "undefined") return
    function onStorage(event: StorageEvent) {
      if (event.key === stagePreferenceStorageKeys.stageDisplay) {
        setStageDisplayPrefs(loadStageDisplayPreferences())
      } else if (event.key === stagePreferenceStorageKeys.motionPngSettings) {
        setMotionPngSettings(loadMotionPngSettings())
      } else if (event.key === stagePreferenceStorageKeys.svgSettings) {
        setSvgAvatarSettings(loadSvgAvatarSettings())
      } else if (event.key === stagePreferenceStorageKeys.svgCharacter) {
        setSvgCharacter(loadSvgCharacter())
      } else if (event.key === stagePreferenceStorageKeys.avatarMode) {
        const mode = loadAvatarMode()
        if (mode) setAvatarMode(mode)
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  useEffect(() => {
    autoReplyEnabledRef.current = autoReplyEnabled

    if (!autoReplyEnabled) {
      resetAutoReplyQueues()
      autoContentAbortRef.current?.abort()
      autoContentScheduledKeyRef.current = null
      autoContentExpandedViewerEventsRef.current = new Set()
      autoContentSequenceRef.current = 0
      autoContentSessionBaseRef.current = null
      autoReplySeenScopeRef.current = null
      recentNoveltyScoresRef.current = []
      openThreadsRef.current = []
      turnsSinceChapterBreakRef.current = 0
      assistantTurnCountRef.current = 0
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
    liveViewerEventsRef.current = liveViewerEvents
  }, [liveViewerEvents])

  useEffect(() => {
    if (!autoReplyEnabled) {
      return
    }

    resetAutopilotSession(getAutoContentSessionBase(autoReplyEnabled, platformState))
  }, [autoReplyEnabled, platformState.mode, platformState.status, platformState.target])

  useEffect(() => {
    syncAutopilotRecentTurns(recentTurns)
  }, [recentTurns])

  useEffect(() => {
    if (!autoReplyEnabled) {
      return
    }

    const nextSeenScope = `${platformState.mode ?? "chat"}:${platformState.target ?? "default"}`

    if (autoReplySeenScopeRef.current === nextSeenScope) {
      return
    }

    autoReplySeenScopeRef.current = nextSeenScope
    autoReplySeenEventIdsRef.current = new Set()
  }, [autoReplyEnabled, platformState.mode, platformState.target])

  useEffect(() => {
    if (!autoReplyEnabled) {
      return
    }

    for (const viewerEvent of [...liveViewerEventsRef.current].reverse()) {
      enqueueAutoReplyEvent(viewerEvent)
    }

    void pumpAutoReplyGenerationQueue()
    void pumpPreparedAutoReplyQueue()
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
      dopamine.triggerCueFromComment(viewerEvent)

      // Random live persona mutation trigger (20% chance when cooldown ready)
      if (
        viewerEvent.kind === "comment" &&
        dopamine.isHeavyMutationReady() &&
        Math.random() < 0.2
      ) {
        void triggerLivePersonaMutation(viewerEvent.text, viewerEvent.receivedAt)
      }

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
              outputDeviceId: audioOutputDeviceId ?? undefined,
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

          const wav = await synthesizeVoice(normalizedSegment, abortController.signal, dopamine.state.voice)
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

    const inputKind: "viewer-comment" | "self-driven" =
      options.automation?.source === "platform_auto_reply" ? "viewer-comment" : "self-driven"

    try {
      for await (const event of streamAiResponse({
        automation: options.automation,
        inputKind,
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
          void syncRuntimeStatus()
        }

        if (event.type === "meta") {
          if (isChatRunRecap(event.meta.raw)) {
            setLatestRunRecap(event.meta.raw)
            void syncRuntimeStatus()
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

    const prompt = buildAutoReplyPrompt(event, currentCharacterName)
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

    const wav = await synthesizeVoice(text, signal, dopamine.state.voice)
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
    handlePersonaAutoRewriteTick()
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
    handlePersonaAutoRewriteTick()
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
    preparedAutoReplyQueueRef.current = enqueuePreparedReply(preparedAutoReplyQueueRef.current, reply)
  }

  function buildAutoReplyRetryKey(events: PlatformViewerEvent[]) {
    return buildPreparedReplySignature(events.map((event) => event.id))
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

  // TODO(refactor): moving this trigger into useAutopilotScheduler would require threading
  // App-owned runtime/playback setters and risks changing ordering; keep only pure scheduler parts extracted.
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

    let effectivePrompt = candidate.suggestion.prompt
    let plannerTitle = candidate.suggestion.title

    if (candidate.source === "autopilot") {
      const plannerHints = derivePlannerHints(runtimeCharacterSins, {
        recentNoveltyAverage: averageNoveltyScore(recentNoveltyScoresRef.current) ?? 50,
        openThreadCount: openThreadsRef.current.length,
        suggestion: candidate.suggestion.id,
      })
      const stalenessSnapshot = createAutopilotStalenessSnapshot(
        liveViewerEventsRef.current,
        recentTurnsRef.current,
      )

      try {
        const planner = await requestAutopilotTopic(
          {
            baseSuggestionId: candidate.suggestion.id,
            basePrompt: candidate.suggestion.prompt,
            baseSummary: candidate.suggestion.summary,
            baseTitle: candidate.suggestion.title,
            characterStateSins: runtimeCharacterSins,
            liveViewerEvent: liveViewerEvents[0]
              ? { authorName: liveViewerEvents[0].authorName, text: liveViewerEvents[0].text }
              : null,
            recentAssistantTurns: recentTurnsRef.current
              .filter((turn) => turn.role === "assistant")
              .map((turn) => turn.text),
            recentUserTurns: recentTurnsRef.current
              .filter((turn) => turn.role === "user")
              .map((turn) => turn.text),
            toneDirective: describeToneDirective(runtimeCharacterSins),
            openThreads: openThreadsRef.current,
            recentNoveltyScores: recentNoveltyScoresRef.current,
            plannerHints,
          },
          abortController.signal,
        )

        if (isAutopilotStale(stalenessSnapshot, liveViewerEventsRef.current, recentTurnsRef.current)) {
          setRuntimeProgress((current) =>
            appendRuntimeActivity(current, {
              detail: "新しい入力が来たので自走候補を破棄しました",
              kind: "content",
              label: `${candidate.suggestion.title} は staleness gate で取消`,
              status: "warn",
            }),
          )
          autoContentBusyRef.current = false
          autoContentAbortRef.current = null
          return
        }

        if (planner.prompt) {
          effectivePrompt = planner.prompt
          plannerTitle = planner.title || plannerTitle
          // Record novelty for future planner cycles + chapter-break tracking.
          if (typeof planner.noveltyScore === "number" && Number.isFinite(planner.noveltyScore)) {
            recentNoveltyScoresRef.current = appendRecentNoveltyScore(
              recentNoveltyScoresRef.current,
              planner.noveltyScore,
            )
          }
          if (candidate.suggestion.id === "chapter-break") {
            turnsSinceChapterBreakRef.current = 0
          }
          setRuntimeProgress((current) =>
            appendRuntimeActivity(current, {
              detail: `自走プランナー: ${planner.novelty || planner.summary || "ネタ更新"} (sources: ${planner.sources.join(", ") || "—"}${planner.retriedReason ? ` / retry=${planner.retriedReason}` : ""})`,
              kind: "content",
              label: `${plannerTitle} を自走プランナーで補強`,
              status: "done",
            }),
          )
        }
      } catch (error) {
        if (!abortController.signal.aborted && !isAbortError(error)) {
          console.warn("autopilot planner failed, falling back to base prompt:", error)
          setRuntimeProgress((current) =>
            appendRuntimeActivity(current, {
              detail: error instanceof Error ? error.message : "プランナー応答失敗",
              kind: "content",
              label: `${candidate.suggestion.title} は基底プロンプトでフォールバック`,
              status: "warn",
            }),
          )
        }
      }
    }

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
        effectivePrompt,
        recentTurnsRef.current,
        abortController.signal,
        { source: "manual" },
        candidate.source === "autopilot" ? "self-driven" : "viewer-comment",
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
        ? buildCompactAutoReplyPrompt(selectedEvents, currentCharacterName)
        : buildAutoReplyPrompt(primaryEvent, currentCharacterName, { shortReply: shortReplyMode })
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
        let fullResponseText = ""
        let pendingSpeechText = ""
        let action: AutomationAction | null = null
        let automationEnvelope: AutomationEnvelope | null = null
        let finalEmotion: Emotion | null = null
        let emotionPayload: FinalEmotionPayload | null = null
        let latestRunRecap: ChatRunRecap | null = null
        let moderation: ModerationAssessment | null = null
        let providerMetadata: ChatMetadataPayload | null = null
        let sessionMetadata: ChatSessionPayload | null = null
        let speechError: Error | null = null
        const audioSegments: Array<{ blob: Blob; emotion: Emotion; text: string }> = []
        let synthesisTail = Promise.resolve()
        let pendingSynthesisCount = 0

        const handlePrefetchError = (error: unknown) => {
          if (abortController.signal.aborted) return
          speechError = error instanceof Error ? error : new Error("VOICEVOX音声の処理に失敗しました。")
        }

        const prefetchSpeechSegment = (segment: string) => {
          const normalizedSegment = segment.trim()
          if (!normalizedSegment || speechError) return
          const segmentEmotion = inferEmotionFromText(normalizedSegment)
          pendingSynthesisCount += 1
          synthesisTail = synthesisTail
            .then(async () => {
              if (abortController.signal.aborted) return
              const wav = await synthesizeVoice(normalizedSegment, abortController.signal, dopamine.state.voice)
              audioSegments.push({ blob: wav, emotion: segmentEmotion, text: normalizedSegment })
            })
            .catch((error: unknown) => {
              handlePrefetchError(error)
            })
            .finally(() => {
              pendingSynthesisCount -= 1
            })
        }

        try {
          for await (const event of streamAiResponse({
            automation: automationRequest,
            inputKind: "viewer-comment",
            prompt,
            recentTurns: recentTurnsRef.current,
            signal: abortController.signal,
          })) {
            if (event.type === "automation") {
              automationEnvelope = event.payload
              action = event.payload.actions[0] ?? null
            }
            if (event.type === "text") {
              fullResponseText += event.text
              pendingSpeechText += event.text
              const { remainder, segments } = extractSpeechSegments(pendingSpeechText)
              pendingSpeechText = remainder
              segments.forEach(prefetchSpeechSegment)
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

          if (pendingSpeechText) {
            const { segments } = extractSpeechSegments(pendingSpeechText, { force: true })
            segments.forEach(prefetchSpeechSegment)
          }

          await synthesisTail

          if (speechError) throw speechError

          const normalizedResponse = fullResponseText.trim()
          if (!normalizedResponse) {
            throw new Error("AI から空の応答が返りました。")
          }

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
          appendRecentTurns(prompt, normalizedResponse)
          const preparedReply: PreparedAutoReply = {
            action,
            audioSegments: audioSegments.length > 0 ? audioSegments : undefined,
            finalEmotion,
            id: retryKey,
            isMonetized: selectedEvents.some((event) => event.isMonetized),
            moderation,
            responseText: normalizedResponse,
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

    const nextReply = dequeuePreparedReply(preparedAutoReplyQueueRef.current)

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

    // 音声合成済みセグメントがあれば即座に再生（ストリーミング先回り）
    if (reply.audioSegments && reply.audioSegments.length > 0) {
      let hasPlayedSegment = false
      let firstAudioObserved = false

      try {
        for (const next of reply.audioSegments) {
          if (abortController.signal.aborted) {
            break
          }

          if (hasPlayedSegment) {
            await waitForQueuedPlaybackGap(abortController.signal)
          }

          await playAudioBlob(next.blob, {
            onAnalysis: handleMotionPngAnalysis,
            outputDeviceId: audioOutputDeviceId ?? undefined,
            text: next.text,
            signal: abortController.signal,
            onStart: () => {
              if (!abortController.signal.aborted) {
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
              if (!abortController.signal.aborted) {
                resetAvatarMouth()
              }
            },
            onError: (error: unknown) => {
              if (!abortController.signal.aborted) {
                const speechErrorMessage = error instanceof Error ? error.message : "VOICEVOX音声の処理に失敗しました。"
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
            },
          })
          hasPlayedSegment = true
        }
      } catch {
        // ignored: abort or playback error handled by onError
      }

      if (!abortController.signal.aborted) {
        setCaptionText(normalizedResponse)
        setStatus("ready")
        setEmotion(reply.finalEmotion ?? "neutral")
        setAvatarState("idle")
        resetAvatarMouth()
        setRuntimeProgress((current) => finalizeRuntimeProgress(current))
      }

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
              outputDeviceId: audioOutputDeviceId ?? undefined,
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

          const wav = await synthesizeVoice(normalizedSegment, abortController.signal, dopamine.state.voice)
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

  const autoContentSessionBase = getAutoContentSessionBase(autoReplyEnabled, platformState)
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
  const currentCharacterName = chatSettings.characterName.trim() || characterProfile.name
  const autoReplyPendingCount =
    autoReplyGenerationCountRef.current +
    autoReplyEventQueueRef.current.length +
    preparedAutoReplyQueueRef.current.length +
    (preparedAutoReplyPlaybackBusyRef.current ? 1 : 0)
  const latestViewerEventAgeLabel = formatRelativeTimestamp(platformState.lastEventAt ?? liveViewerEvents[0]?.receivedAt ?? null)
  const nextAutomaticContentCandidate = useMemo(
    () => {
      const noveltyAverage = averageNoveltyScore(recentNoveltyScoresRef.current)
      return selectAutomaticContentSuggestion({
        contentSurface,
        liveViewerEvents,
        platformState,
        recentTurns,
        sequence: autoContentSequenceRef.current,
        sessionKey: autoContentSessionBase,
        sins: runtimeCharacterSins,
        usedViewerEventIds: autoContentExpandedViewerEventsRef.current,
        openThreadCount: openThreadsRef.current.length,
        turnsSinceChapterBreak: turnsSinceChapterBreakRef.current,
        recentNoveltyAverage: noveltyAverage,
      })
    },
    [autoContentSessionBase, autoReplyEnabled, contentSurface, liveViewerEvents, platformState, recentTurns, runtimeCharacterSins],
  )
  const runtimeDisplay = describeRuntimeDisplay(status, runtimeProgress, visibleError, {
    autoReplyEnabled,
    nextAutomaticContentCandidate,
    platformState,
    recentViewerEventCount: liveViewerEvents.length,
  })
  const isBusy = status === "thinking" || status === "synthesizing" || status === "playing"

  useScheduleAutomaticContentSuggestion({
    autoReplyEnabled,
    autoContentBusyRef,
    autoContentScheduledKeyRef,
    nextAutomaticContentCandidate,
    preparedAutoReplyQueueRef,
    status,
    triggerAutomaticContentSuggestion,
  })

  const viewMode =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("view") : null

  const sinSignal = useMemo(
    () => computeSinExpressionSignal(runtimeCharacterSins),
    [runtimeCharacterSins],
  )

  const renderStageView = (variant: "obs" | "preview") => (
    <DopamineEffects state={dopamine.state}>
      <StageView
        avatarMode={avatarMode}
        avatarState={avatarState}
        caption={responseText}
        showCaption={stageDisplayPrefs.showCaption}
        captionStyle={stageDisplayPrefs.captionStyle}
        showComments={stageDisplayPrefs.showComments}
        liveViewerEvents={liveViewerEvents}
        emotion={emotion}
        motionPngAvatarRef={variant === "obs" ? motionPngAvatarRef : undefined}
        motionPngFiles={motionPngFiles}
        motionPngSettings={motionPngSettings}
        svgAvatarSettings={svgAvatarSettings}
        svgCharacter={svgCharacter}
        sinSignal={sinSignal}
        onMotionPngAssetStatusChange={variant === "obs" ? setMotionPngAssetStatus : undefined}
        stageBackgroundMedia={stageBackgroundMedia}
        viseme={viseme}
        embedded={variant === "preview"}
        dopamineState={dopamine.state}
      />
    </DopamineEffects>
  )

  if (viewMode === "stage") {
    return renderStageView("obs")
  }

  if (stagePreviewOpen) {
    return (
      <>
        {renderStageView("obs")}
        <button
          type="button"
          className="stage-preview-exit"
          onClick={() => setStagePreviewOpen(false)}
          aria-label="操作画面に戻る"
        >
          ← 操作画面に戻る
        </button>
      </>
    )
  }

  return (
    <>
      <OperatorConsole
        characterName={currentCharacterName}
        runtimeLabel={runtimeDisplay.label}
        runtimeTone={runtimeDisplay.tone}
        runtimeDetail={runtimeDisplay.detail}
        status={status}
        platformState={platformState}
        autoReplyEnabled={autoReplyEnabled}
        autoReplyPendingCount={autoReplyPendingCount}
        voiceEnabled={voiceEnabled}
        onVoiceEnabledChange={setVoiceEnabled}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenStagePreview={() => setStagePreviewOpen(true)}
        avatarMode={avatarMode}
        avatarState={avatarState}
        emotion={emotion}
        viseme={viseme}
        motionPngFiles={motionPngFiles}
        motionPngSettings={motionPngSettings}
        motionPngAvatarRef={motionPngAvatarRef}
        svgCharacter={svgCharacter}
        sinSignal={sinSignal}
        onMotionPngAssetStatusChange={setMotionPngAssetStatus}
        responseText={responseText}
        recentTurns={recentTurns}
        contentSurface={contentSurface}
        runtimeActivities={runtimeProgress.activities}
        onUseContentSuggestion={handlePrompt}
        liveViewerEvents={liveViewerEvents}
        onAutoReplyEnabledChange={setAutoReplyEnabled}
        onCancel={handleCancel}
        latestAutomationPolicy={latestAutomationEnvelope?.policy ?? platformState.automationPolicy}
        latestModeration={latestModeration}
        platformMode={platformMode}
        platformTarget={platformTarget}
        onPlatformModeChange={setPlatformMode}
        onPlatformTargetChange={setPlatformTarget}
        onPlatformStart={handlePlatformStart}
        onPlatformStop={handlePlatformStop}
        onSubmit={handlePrompt}
        dopamineState={dopamine.state}
        onTriggerManualMutation={() => void triggerLivePersonaMutation()}
        onUndoMutation={dopamine.undoLastMutation}
      />

      <Suspense fallback={null}>
        {settingsOpen && (
          <SettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            avatarMode={avatarMode}
            onAvatarModeChange={setAvatarMode}
            backgroundAssetKind={stageBackgroundMedia?.kind ?? null}
        backgroundAssetLabel={stageBackgroundMedia?.name ?? null}
        backgroundPresetId={stageBackgroundMedia?.kind === "preset" ? stageBackgroundMedia.id : null}
        onBackgroundClear={handleStageBackgroundClear}
        onBackgroundSelect={handleStageBackgroundSelect}
        onBackgroundPresetSelect={handleStageBackgroundPresetSelect}
        onMotionPngClear={handleMotionPngClear}
        onMotionPngFolderSelect={handleMotionPngFolderSelect}
        onMotionPngSettingChange={updateMotionPngSettings}
        motionPngAssetStatus={motionPngAssetStatus}
        motionPngFolderLabel={motionPngFolderLabel}
        motionPngSettings={motionPngSettings}
        svgAvatarSettings={svgAvatarSettings}
        onSvgAvatarSettingChange={updateSvgAvatarSettings}
        svgCharacter={svgCharacter}
        onSvgCharacterChange={setSvgCharacter}
        stagePreview={renderStageView("preview")}
        stageDisplayPrefs={stageDisplayPrefs}
        onStageDisplayPrefsChange={updateStageDisplayPrefs}
        voiceEnabled={voiceEnabled}
        onVoiceEnabledChange={setVoiceEnabled}
        voicevoxHealth={voicevoxHealth}
        voiceSettings={chatSettings.voice}
        latestAutomationPolicy={latestAutomationEnvelope?.policy ?? platformState.automationPolicy}
        latestModeration={latestModeration}
        chatSettings={chatSettings}
        chatSettingsBusy={chatSettingsAction === "saving"}
        chatSettingsNotice={chatSettingsNotice}
        chatMemoryClearBusy={chatSettingsAction === "clearing"}
        characterPresets={characterPresets}
        characterPresetBusy={characterPresetBusy}
        characterPresetNotice={characterPresetNotice}
        characterRuleStatus={characterRuleStatus}
        runtimeCharacterSins={runtimeCharacterSins}
        onCharacterPresetCreate={handleCharacterPresetCreate}
        onCharacterPresetDelete={handleCharacterPresetDelete}
        onCharacterPresetUpdate={handleCharacterPresetUpdate}
        onCharacterStateReset={handleCharacterStateReset}
        onChatMemoryClear={handleChatMemoryClear}
        onAllSettingsSave={handleAllSettingsSave}
        onSettingsDiscard={handleSettingsDiscard}
        settingsSaveBusy={settingsSaveBusy}
        settingsSaveNotice={settingsSaveNotice}
        audioOutputDeviceId={audioOutputDeviceId}
        audioOutputDevices={audioOutput.devices}
        audioOutputSupported={audioOutput.supported}
        onAudioOutputDeviceChange={setAudioOutputDeviceId}
        uiSettingsDirty={
          savedUiSettings
            ? JSON.stringify(collectCurrentUiSettings()) !== JSON.stringify(savedUiSettings)
            : false
        }
        onPersonaAutoRewriteRequest={handlePersonaAutoRewriteRequest}
        personaAutoRewriteBusy={personaAutoRewriteBusy}
        personaAutoRewriteNotice={personaAutoRewriteNotice}
        personaAutoRewriteUpdatedAt={personaAutoRewriteUpdatedAt}
          />
        )}
      </Suspense>

      {visibleError && (
        <div className="toast" role="alert">
          <AlertTriangle className="toast__icon" size={16} aria-hidden />
          <p className="toast__msg">{visibleError}</p>
          <button
            className="toast__close"
            type="button"
            aria-label="閉じる"
            onClick={dismissError}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
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
    </>
  )
}
