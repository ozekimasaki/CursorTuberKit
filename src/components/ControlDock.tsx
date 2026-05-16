import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react"
import { describeAutomationExecutionLevel, type AutomationPolicy } from "../../shared/automation"
import {
  maxCharacterPresetLabelLength,
  type CharacterPreset,
  type CharacterPresetInput,
} from "../../shared/characterPresets"
import { createDefaultChatSettings, maxCharacterNameLength, maxCharacterPromptLength, type ChatSettings } from "../../shared/chatSettings"
import { characterProfile, characterProfileHighlights } from "../../shared/characterProfile"
import { characterSinNames, type CharacterSinName } from "../../shared/characterState"
import type { ModerationAssessment } from "../../shared/moderation"
import type {
  PlatformChatMode,
  PlatformChatState,
  PlatformViewerEvent,
} from "../../shared/platformChat"
import { type RuntimeTone, type StreamRuntimeActivity, type StreamStatus } from "../App"
import type { AvatarMode, MotionPngAssetStatus, MotionPngSettings } from "../lib/avatarConfig"
import type { CharacterContentSurface } from "../lib/contentSurface"
import type { ConversationTurn } from "../lib/streamAi"
import { type VoicevoxHealth } from "../lib/voicevox"
import { ContentSurfacePanel } from "./ContentSurfacePanel"
import { ViewerEventFeed } from "./ViewerEventFeed"

type ControlDockProps = {
  avatarMode: AvatarMode
  backgroundAssetKind: "image" | "video" | null
  backgroundAssetLabel: string | null
  onAvatarModeChange: (mode: AvatarMode) => void
  onBackgroundClear: () => void
  onBackgroundSelect: () => void
  contentSurface: CharacterContentSurface
  open: boolean
  onClose: () => void
  onMotionPngClear: () => void
  onMotionPngFolderSelect: () => void
  onMotionPngSettingChange: (patch: Partial<MotionPngSettings>) => void
  onStreamScreenModeChange: (enabled: boolean) => void
  errorMessage: string | null
  onCancel: () => void
  onSubmit: (prompt: string) => void
  onVoiceEnabledChange: (enabled: boolean) => void
  responseText: string
  runtimeActivities: StreamRuntimeActivity[]
  runtimeDetail: string | null
  runtimeLabel: string
  runtimeTone: RuntimeTone
  status: StreamStatus
  voiceEnabled: boolean
  voicevoxHealth: VoicevoxHealth | null
  platformMode: PlatformChatMode
  platformTarget: string
  platformState: PlatformChatState
  liveViewerEvents: PlatformViewerEvent[]
  latestAutomationPolicy: AutomationPolicy
  latestModeration: ModerationAssessment | null
  autoReplyEnabled: boolean
  autoReplyPendingCount: number
  chatMemoryClearBusy: boolean
  characterPresetBusy: boolean
  characterPresetNotice: string | null
  characterPresets: CharacterPreset[]
  chatSettings: ChatSettings
  chatSettingsBusy: boolean
  chatSettingsNotice: string | null
  motionPngAssetStatus: MotionPngAssetStatus
  motionPngFolderLabel: string | null
  motionPngSettings: MotionPngSettings
  recentTurns: ConversationTurn[]
  streamScreenMode: boolean
  onAutoReplyEnabledChange: (enabled: boolean) => void
  onCharacterPresetCreate: (preset: CharacterPresetInput) => CharacterPreset | Promise<CharacterPreset | null> | null
  onCharacterPresetDelete: (presetId: string) => boolean | Promise<boolean>
  onCharacterPresetUpdate: (
    presetId: string,
    preset: CharacterPresetInput,
  ) => CharacterPreset | Promise<CharacterPreset | null> | null
  onChatMemoryClear: () => void | Promise<void>
  onChatSettingsSave: (settings: ChatSettings) => void | Promise<void>
  onPlatformModeChange: (mode: PlatformChatMode) => void
  onPlatformStart: () => void
  onPlatformStop: () => void
  onPlatformTargetChange: (target: string) => void
  onUseContentSuggestion: (prompt: string) => void
}

type DockTab = "live" | "content" | "transcript" | "settings"
type SettingsSection = "character" | "stream" | "avatar" | "advanced"

export function ControlDock({
  avatarMode,
  backgroundAssetKind,
  backgroundAssetLabel,
  onAvatarModeChange,
  onBackgroundClear,
  onBackgroundSelect,
  contentSurface,
  open,
  onClose,
  onMotionPngClear,
  onMotionPngFolderSelect,
  onMotionPngSettingChange,
  onStreamScreenModeChange,
  errorMessage,
  onCancel,
  onSubmit,
  onVoiceEnabledChange,
  responseText,
  runtimeActivities,
  runtimeDetail,
  runtimeLabel,
  runtimeTone,
  status,
  voiceEnabled,
  voicevoxHealth,
  platformMode,
  platformTarget,
  platformState,
  liveViewerEvents,
  latestAutomationPolicy,
  latestModeration,
  autoReplyEnabled,
  autoReplyPendingCount,
  chatMemoryClearBusy,
  characterPresetBusy,
  characterPresetNotice,
  characterPresets,
  chatSettings,
  chatSettingsBusy,
  chatSettingsNotice,
  motionPngAssetStatus,
  motionPngFolderLabel,
  motionPngSettings,
  recentTurns,
  streamScreenMode,
  onAutoReplyEnabledChange,
  onCharacterPresetCreate,
  onCharacterPresetDelete,
  onCharacterPresetUpdate,
  onChatMemoryClear,
  onChatSettingsSave,
  onPlatformModeChange,
  onPlatformStart,
  onPlatformStop,
  onPlatformTargetChange,
  onUseContentSuggestion,
}: ControlDockProps) {
  const [prompt, setPrompt] = useState("")
  const [characterNameDraft, setCharacterNameDraft] = useState(chatSettings.characterName)
  const [characterPromptDraft, setCharacterPromptDraft] = useState(chatSettings.characterPrompt)
  const [characterSinsDraft, setCharacterSinsDraft] = useState(chatSettings.characterState.sins)
  const [presetLabelDraft, setPresetLabelDraft] = useState(chatSettings.characterName)
  const [selectedPresetId, setSelectedPresetId] = useState("")
  const [memoryModeDraft, setMemoryModeDraft] = useState(chatSettings.memory.mode)
  const [memoryPersistDraft, setMemoryPersistDraft] = useState(chatSettings.memory.persistResponses)
  const [tab, setTab] = useState<DockTab>("live")
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("character")
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const isBusy = status === "thinking" || status === "synthesizing" || status === "playing"
  const canSubmit = !isBusy && prompt.trim().length > 0
  const isPlatformConnecting = platformState.status === "connecting"
  const isPlatformConnected = platformState.status === "connected"
  const canStartPlatform = !isPlatformConnecting && platformTarget.trim().length > 0

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`
  }, [prompt])

  useEffect(() => {
    setCharacterNameDraft(chatSettings.characterName)
    setCharacterPromptDraft(chatSettings.characterPrompt)
    setCharacterSinsDraft(chatSettings.characterState.sins)
    setMemoryModeDraft(chatSettings.memory.mode)
    setMemoryPersistDraft(chatSettings.memory.persistResponses)
  }, [chatSettings])

  useEffect(() => {
    if (!selectedPresetId) {
      return
    }

    if (!characterPresets.some((preset) => preset.id === selectedPresetId)) {
      setSelectedPresetId("")
    }
  }, [characterPresets, selectedPresetId])

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (canSubmit) onSubmit(prompt)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      if (canSubmit) onSubmit(prompt)
    }
    if (e.key === "Escape" && !isBusy && prompt) {
      e.preventDefault()
      setPrompt("")
    }
  }

  function buildPresetInput(): CharacterPresetInput {
    return {
      label: trimmedPresetLabel || characterNameDraft,
      characterName: characterNameDraft,
      characterPrompt: characterPromptDraft,
    }
  }

  async function handlePresetCreate() {
    const created = await onCharacterPresetCreate(buildPresetInput())

    if (created) {
      setSelectedPresetId(created.id)
      setPresetLabelDraft(created.label)
    }
  }

  async function handlePresetOverwrite() {
    if (!selectedPreset) {
      return
    }

    const updated = await onCharacterPresetUpdate(selectedPreset.id, buildPresetInput())

    if (updated) {
      setSelectedPresetId(updated.id)
      setPresetLabelDraft(updated.label)
    }
  }

  async function handlePresetDelete() {
    if (!selectedPreset) {
      return
    }

    if (!window.confirm(`プリセット「${selectedPreset.label}」を削除しますか？`)) {
      return
    }

    const deleted = await onCharacterPresetDelete(selectedPreset.id)

    if (deleted) {
      setSelectedPresetId("")
    }
  }

  function handlePresetApply() {
    if (!selectedPreset) {
      return
    }

    setCharacterNameDraft(selectedPreset.characterName)
    setCharacterPromptDraft(selectedPreset.characterPrompt)
    setPresetLabelDraft(selectedPreset.label)
  }

  async function handleMemoryClear() {
    if (!window.confirm("長期記憶をクリアしますか？ 継続文脈がリセットされます。")) {
      return
    }

    await onChatMemoryClear()
  }

  function handleBackgroundClear() {
    if (!backgroundAssetLabel || window.confirm("現在の背景差し替えをクリアしますか？")) {
      onBackgroundClear()
    }
  }

  function handleMotionPngClear() {
    if ((!motionPngFolderLabel && !motionPngAssetStatus.message) || window.confirm("MotionPNGTuber アセットをクリアしますか？")) {
      onMotionPngClear()
    }
  }

  const voiceSummary = voicevoxHealth
    ? voicevoxHealth.ok
      ? `接続中 · speaker ${voicevoxHealth.speaker}${voicevoxHealth.version ? ` · ${voicevoxHealth.version}` : ""}`
      : `未接続 · ${voicevoxHealth.url}`
    : "確認中..."
  const platformSummary =
    platformState.status === "connected"
      ? `接続中 · ${platformState.mode ?? "unknown"}`
      : platformState.status === "connecting"
        ? "接続中..."
        : platformState.status === "error"
          ? `エラー · ${platformState.lastError ?? "接続失敗"}`
          : "未接続"
  const automationPolicySummary = describeAutomationExecutionLevel(latestAutomationPolicy.maxExecutionLevel)
  const selectedPreset = characterPresets.find((preset) => preset.id === selectedPresetId) ?? null
  const assistantHistory = recentTurns.filter((turn) => turn.role === "assistant").slice(-4).reverse()
  const isSettingsDirty =
    characterNameDraft !== chatSettings.characterName ||
    characterPromptDraft !== chatSettings.characterPrompt ||
    characterSinNames.some((sinName) => characterSinsDraft[sinName] !== chatSettings.characterState.sins[sinName]) ||
    memoryModeDraft !== chatSettings.memory.mode ||
    memoryPersistDraft !== chatSettings.memory.persistResponses
  const trimmedPresetLabel = presetLabelDraft.replace(/\s+/g, " ").trim()
  const canSavePreset = trimmedPresetLabel.length > 0 && !characterPresetBusy
  const canOverwritePreset = !!selectedPreset && trimmedPresetLabel.length > 0 && !characterPresetBusy
  const canDeletePreset = !!selectedPreset && !characterPresetBusy

  const commentsPanel = (
    <div className="card comments-panel">
      <div className="card__header">
        <div>
          <p className="card__title">Viewer Queue</p>
          <p className="card__hint card__hint--compact">受信コメントを時系列で確認します。</p>
        </div>
        <span className="info-chip info-chip--muted">{liveViewerEvents.length}件</span>
      </div>
      <ViewerEventFeed events={liveViewerEvents} />
    </div>
  )

  const quickComposePanel = (
    <form className="card composer composer-card" onSubmit={handleSubmit}>
      <div className="card__header">
        <div>
          <p className="card__title">Quick Compose</p>
          <p className="card__hint card__hint--compact">ライブ中でも手動で一言差し込めます。</p>
        </div>
        <span className="info-chip info-chip--muted">{prompt.length} / 4000</span>
      </div>
      <div className="composer__meta">
        <span>Ctrl / Cmd + Enter で送信</span>
        <span>{isBusy ? "発話中は待機" : "待機中"}</span>
      </div>
      <textarea
        ref={textareaRef}
        aria-label={characterProfile.promptLabel}
        maxLength={4000}
        placeholder={characterProfile.promptPlaceholder}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={4}
      />
      <div className="composer__actions">
        <button className="btn btn--primary" type="submit" disabled={!canSubmit}>
          {isBusy ? "応答中…" : "送信"}
        </button>
        <button className="btn btn--secondary" type="button" onClick={() => setPrompt("")} disabled={isBusy || !prompt}>
          クリア
        </button>
        <button className="btn btn--danger" type="button" onClick={onCancel} disabled={!isBusy}>
          中断
        </button>
      </div>
    </form>
  )

  const runtimeSummaryPanel = (
    <div className="card runtime-card">
      <div className="card__header">
        <div>
          <p className="card__title">Runtime</p>
          <p className="card__hint card__hint--compact">いま何をしているかだけをすぐ確認できます。</p>
        </div>
        <span className={`runtime-chip runtime-chip--${runtimeTone}`}>{runtimeLabel}</span>
      </div>
      {runtimeDetail && <p className="runtime-card__detail">{runtimeDetail}</p>}
      {runtimeActivities.length > 0 ? (
        <ol className="runtime-log">
          {runtimeActivities.slice(0, 3).map((activity) => (
            <li key={activity.id} className="runtime-log__item">
              <div className="runtime-log__head">
                <span className={`runtime-log__kind runtime-log__kind--${activity.tone}`}>
                  {formatRuntimeKind(activity.kind)}
                </span>
                {activity.status && <span className="runtime-log__status">{activity.status}</span>}
              </div>
              <p className="runtime-log__label">{activity.label}</p>
              {activity.detail && <p className="runtime-log__detail">{activity.detail}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="card__hint">新しいストリームを開始すると、ここに進行ログを表示します。</p>
      )}
    </div>
  )

  const liveControlPanel = (
    <div className="card card--primary">
      <div className="card__header">
        <div>
          <p className="card__title">Live Control</p>
          <p className="card__hint card__hint--compact">配信接続・自動返答・HUD をここでまとめて操作します。</p>
        </div>
        <span className={`runtime-chip runtime-chip--${runtimeTone}`}>{runtimeLabel}</span>
      </div>
      <div className="card__meta">
        <span className={`info-chip info-chip--${isPlatformConnected ? "ok" : isPlatformConnecting ? "warn" : "muted"}`}>
          {platformSummary}
        </span>
        <span className={`info-chip info-chip--${autoReplyEnabled ? "ok" : "muted"}`}>
          自動返答 {autoReplyEnabled ? "ON" : "OFF"}
        </span>
        <span className="info-chip info-chip--muted">処理待ち {autoReplyPendingCount}</span>
        {platformState.lastEventAt && <span className="info-chip info-chip--muted">最終 {describeLastEventAge(platformState.lastEventAt)}</span>}
      </div>
      <div className="field-group">
        <label className="field">
          <span className="card__key">プラットフォーム</span>
          <select
            className="field__input"
            value={platformMode}
            onChange={(e) => onPlatformModeChange(e.target.value as PlatformChatMode)}
            disabled={isPlatformConnecting}
          >
            <option value="youtube">YouTube</option>
            <option value="twitch">Twitch</option>
            <option value="kick">Kick</option>
          </select>
        </label>
        <label className="field">
          <span className="card__key">{platformTargetLabel(platformMode)}</span>
          <input
            className="field__input"
            type="text"
            value={platformTarget}
            placeholder={platformTargetPlaceholder(platformMode)}
            onChange={(e) => onPlatformTargetChange(e.target.value)}
            disabled={isPlatformConnecting}
          />
        </label>
      </div>
      <div className="composer__actions">
        <button className="btn btn--primary" type="button" onClick={onPlatformStart} disabled={!canStartPlatform}>
          {isPlatformConnected ? "再接続" : isPlatformConnecting ? "接続中…" : "接続"}
        </button>
        <button
          className="btn btn--secondary"
          type="button"
          onClick={onPlatformStop}
          disabled={!isPlatformConnected && !isPlatformConnecting}
        >
          切断
        </button>
        <button
          className={`toggle-switch${autoReplyEnabled ? " toggle-switch--on" : ""}`}
          type="button"
          role="switch"
          aria-checked={autoReplyEnabled}
          aria-label={`自動返答を${autoReplyEnabled ? "オフ" : "オン"}にする`}
          onClick={() => onAutoReplyEnabledChange(!autoReplyEnabled)}
        >
          <span className="toggle-switch__track" aria-hidden="true">
            <span className="toggle-switch__thumb" />
          </span>
          <span className={`card__val card__val--${autoReplyEnabled ? "ok" : "warn"}`}>
            自動返答 {autoReplyEnabled ? "ON" : "OFF"}
          </span>
        </button>
        <button
          className={`btn btn--secondary${streamScreenMode ? " btn--active" : ""}`}
          type="button"
          onClick={() => onStreamScreenModeChange(!streamScreenMode)}
        >
          {streamScreenMode ? "HUD表示中" : "HUD表示"}
        </button>
      </div>
    </div>
  )

  return (
    <aside
      className={`dock${open ? " dock--open" : ""}`}
      aria-hidden={!open}
      aria-label="操作ドック"
    >
      <header className="dock__header">
        <div>
          <h2 className="dock__title">{characterProfile.panelHeading}</h2>
          <p className="dock__sub">{characterProfile.tagline}</p>
        </div>
        <div className="dock__header-actions">
          <button
            className={`dock__mode-btn${streamScreenMode ? " dock__mode-btn--active" : ""}`}
            onClick={() => onStreamScreenModeChange(!streamScreenMode)}
            type="button"
          >
            {streamScreenMode ? "HUD表示中" : "HUD表示"}
          </button>
          <button className="dock__close" onClick={onClose} aria-label="ドックを閉じる" type="button">
            ×
          </button>
        </div>
      </header>

      <nav className="dock__tabs" role="tablist">
        {([
          ["live", "ライブ"],
          ["content", "ネタ"],
          ["transcript", "字幕"],
          ["settings", "設定"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            className={`dock__tab${tab === key ? " dock__tab--active" : ""}`}
            onClick={() => setTab(key)}
            role="tab"
            aria-selected={tab === key}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="dock__body">
        <>
          {errorMessage && (
            <div className="notice notice--error" role="alert">
              <p className="notice__title">エラー</p>
              <p className="notice__text">{errorMessage}</p>
            </div>
          )}

          {tab === "live" && (
            <>
              {liveControlPanel}
              {commentsPanel}
              {quickComposePanel}
              {runtimeSummaryPanel}
            </>
          )}

          {tab === "content" && (
            <ContentSurfacePanel
              busy={isBusy}
              onUseSuggestion={onUseContentSuggestion}
              surface={contentSurface}
            />
          )}

          {tab === "transcript" && (
            <>
              <div className="card transcript-card">
                <div className="card__header">
                  <div>
                    <p className="card__title">Now Speaking</p>
                    <p className="card__hint card__hint--compact">いま配信に出ている発話テキストです。</p>
                  </div>
                  <span className={`runtime-chip runtime-chip--${runtimeTone}`}>{runtimeLabel}</span>
                </div>
                <div
                  className={`transcript transcript-card__body${responseText ? "" : " transcript--placeholder"}`}
                  aria-live="polite"
                >
                  {responseText || characterProfile.transcriptPlaceholder}
                </div>
              </div>

              <div className="card">
                <div className="card__header">
                  <div>
                    <p className="card__title">Recent Replies</p>
                    <p className="card__hint card__hint--compact">最近の返答だけをさっと見返せます。</p>
                  </div>
                  <span className="info-chip info-chip--muted">{assistantHistory.length}件</span>
                </div>
                {assistantHistory.length > 0 ? (
                  <ol className="transcript-history">
                    {assistantHistory.map((turn, index) => (
                      <li key={`${index}-${turn.text.slice(0, 20)}`} className="transcript-history__item">
                        <p className="transcript-history__label">Assistant</p>
                        <p className="transcript-history__text">{turn.text}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="card__hint">まだ返答履歴はありません。</p>
                )}
              </div>

              {runtimeSummaryPanel}
            </>
          )}

          {tab === "settings" && (
            <>
              <nav className="section-tabs" aria-label="設定セクション">
                {([
                  ["character", "キャラ"],
                  ["stream", "配信"],
                  ["avatar", "アバター"],
                  ["advanced", "詳細"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    className={`section-tabs__btn${settingsSection === key ? " section-tabs__btn--active" : ""}`}
                    type="button"
                    onClick={() => setSettingsSection(key)}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              {settingsSection === "character" && (
                <>
                  <div className="card card--primary">
                    <div className="card__header">
                      <div>
                        <p className="card__title">Character Draft</p>
                        <p className="card__hint card__hint--compact">
                          キャラクター名・人格・プリセットをまとめて編集します。
                        </p>
                      </div>
                      <span className={`info-chip info-chip--${isSettingsDirty ? "warn" : "ok"}`}>
                        {isSettingsDirty ? "未保存の変更あり" : "保存済み"}
                      </span>
                    </div>
                    <label className="field">
                      <span className="card__key">キャラクター名</span>
                      <input
                        className="field__input"
                        type="text"
                        maxLength={maxCharacterNameLength}
                        value={characterNameDraft}
                        onChange={(e) => setCharacterNameDraft(e.target.value)}
                        disabled={chatSettingsBusy || chatMemoryClearBusy || characterPresetBusy}
                      />
                    </label>
                    <label className="field">
                      <span className="card__key">キャラクター設定プロンプト</span>
                      <textarea
                        className="field__input"
                        rows={8}
                        maxLength={maxCharacterPromptLength}
                        value={characterPromptDraft}
                        onChange={(e) => setCharacterPromptDraft(e.target.value)}
                        disabled={chatSettingsBusy || chatMemoryClearBusy || characterPresetBusy}
                      />
                    </label>
                    <div className="composer__meta">
                      <span>名前・人格・世界観・口調をここで調整</span>
                      <span>{characterPromptDraft.length} / {maxCharacterPromptLength}</span>
                    </div>
                    <div className="field-group">
                      <label className="field">
                        <span className="card__key">プリセット名</span>
                        <input
                          className="field__input"
                          type="text"
                          maxLength={maxCharacterPresetLabelLength}
                          value={presetLabelDraft}
                          onChange={(e) => setPresetLabelDraft(e.target.value)}
                          placeholder="例: お嬢様モード"
                          disabled={characterPresetBusy}
                        />
                      </label>
                      <label className="field">
                        <span className="card__key">保存済みプリセット</span>
                        <select
                          className="field__input"
                          value={selectedPresetId}
                          onChange={(e) => {
                            const nextPresetId = e.target.value
                            setSelectedPresetId(nextPresetId)
                            const nextPreset = characterPresets.find((preset) => preset.id === nextPresetId)
                            if (nextPreset) {
                              setPresetLabelDraft(nextPreset.label)
                            }
                          }}
                          disabled={characterPresetBusy || characterPresets.length === 0}
                        >
                          <option value="">選択してください</option>
                          {characterPresets.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.label} · {preset.characterName}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="composer__actions">
                      <button
                        className="btn btn--secondary"
                        type="button"
                        onClick={() => void handlePresetCreate()}
                        disabled={!canSavePreset}
                      >
                        {characterPresetBusy ? "保存中…" : "新規保存"}
                      </button>
                      <button
                        className="btn btn--secondary"
                        type="button"
                        onClick={handlePresetApply}
                        disabled={!selectedPreset || characterPresetBusy}
                      >
                        ドラフト読込
                      </button>
                      <button
                        className="btn btn--secondary"
                        type="button"
                        onClick={() => void handlePresetOverwrite()}
                        disabled={!canOverwritePreset}
                      >
                        選択更新
                      </button>
                      <button
                        className="btn btn--danger"
                        type="button"
                        onClick={() => void handlePresetDelete()}
                        disabled={!canDeletePreset}
                      >
                        削除
                      </button>
                    </div>
                    <p className="card__hint">
                      プリセットはキャラクター名と本文を保存します。読み込み後は「変更を保存」で本番設定に反映します。
                    </p>
                    {characterPresetNotice && (
                      <div className="notice notice--ok">
                        <p className="notice__text">{characterPresetNotice}</p>
                      </div>
                    )}
                    <div className="composer__actions">
                      <button
                        className="btn btn--primary"
                        type="button"
                        onClick={() =>
                          onChatSettingsSave({
                            ...chatSettings,
                            characterName: characterNameDraft,
                            characterPrompt: characterPromptDraft,
                            characterState: {
                              sins: characterSinsDraft,
                            },
                            memory: {
                              mode: memoryModeDraft,
                              persistResponses: memoryPersistDraft,
                            },
                          })
                        }
                        disabled={chatSettingsBusy || characterPresetBusy || !isSettingsDirty}
                      >
                        {chatSettingsBusy ? "保存中…" : "変更を保存"}
                      </button>
                      <button
                        className="btn btn--secondary"
                        type="button"
                        onClick={() => {
                          const defaults = createDefaultChatSettings()
                          setCharacterNameDraft(defaults.characterName)
                          setCharacterPromptDraft(defaults.characterPrompt)
                          setCharacterSinsDraft(defaults.characterState.sins)
                          setPresetLabelDraft(defaults.characterName)
                          setMemoryModeDraft(defaults.memory.mode)
                          setMemoryPersistDraft(defaults.memory.persistResponses)
                        }}
                        disabled={chatSettingsBusy || chatMemoryClearBusy || characterPresetBusy}
                      >
                        既定に戻す
                      </button>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card__header">
                      <div>
                        <p className="card__title">Initial Behavior Tuning</p>
                        <p className="card__hint card__hint--compact">
                          hook で自動変動する7軸の初期値です。配信中の変動値そのものを固定する設定ではありません。
                        </p>
                      </div>
                      <span className="info-chip info-chip--muted">Advanced</span>
                    </div>
                    <div className="field-group">
                      {characterSinNames.map((sinName) => (
                        <label key={sinName} className="field">
                          <span className="card__key">
                            {describeCharacterSinLabel(sinName)} {characterSinsDraft[sinName]}
                          </span>
                          <input
                            className="field__input field__input--range"
                            type="range"
                            min={0}
                            max={100}
                            value={characterSinsDraft[sinName]}
                            onChange={(e) =>
                              setCharacterSinsDraft((current) => ({
                                ...current,
                                [sinName]: Number.parseInt(e.target.value, 10),
                              }))
                            }
                            disabled={chatSettingsBusy || chatMemoryClearBusy}
                          />
                          <span className="card__hint">{describeCharacterSinHint(sinName)}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="card">
                    <div className="card__header">
                      <div>
                        <p className="card__title">Long-term Memory</p>
                        <p className="card__hint card__hint--compact">記憶の使い方と保存方針を整理します。</p>
                      </div>
                    </div>
                    <div className="field-group">
                      <label className="field">
                        <span className="card__key">返答への反映</span>
                        <select
                          className="field__input"
                          value={memoryModeDraft}
                          onChange={(e) => setMemoryModeDraft(e.target.value as ChatSettings["memory"]["mode"])}
                          disabled={chatSettingsBusy || chatMemoryClearBusy}
                        >
                          <option value="curated">整理して使う（推奨）</option>
                          <option value="full">強めに使う</option>
                          <option value="off">使わない</option>
                        </select>
                      </label>
                    </div>
                    <div className="card__row">
                      <span className="card__key">返答後に記憶へ保存</span>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={memoryPersistDraft}
                          onChange={(e) => setMemoryPersistDraft(e.target.checked)}
                          disabled={chatSettingsBusy || chatMemoryClearBusy}
                        />
                        <span className="toggle__slider" />
                      </label>
                    </div>
                    <div className="composer__actions">
                      <button
                        className="btn btn--danger"
                        type="button"
                        onClick={() => void handleMemoryClear()}
                        disabled={chatSettingsBusy || chatMemoryClearBusy}
                      >
                        {chatMemoryClearBusy ? "クリア中…" : "長期記憶をクリア"}
                      </button>
                    </div>
                    <p className="card__hint">
                      支離滅裂さが気になるときは「整理して使う」か「使わない」に下げ、必要ならここから MemKraft の継続記憶を初期化できます。
                    </p>
                    {chatSettingsNotice && (
                      <div className="notice notice--ok">
                        <p className="notice__text">{chatSettingsNotice}</p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {settingsSection === "stream" && (
                <>
                  {liveControlPanel}
                  <div className="card">
                    <div className="card__header">
                      <div>
                        <p className="card__title">Automation Safety</p>
                        <p className="card__hint card__hint--compact">自動実行の上限と安全判定だけを確認します。</p>
                      </div>
                    </div>
                    <div className="card__row">
                      <span className="card__key">最大実行レベル</span>
                      <span className="card__val">{automationPolicySummary}</span>
                    </div>
                    <div className="card__row">
                      <span className="card__key">サービス投稿</span>
                      <span className={`card__val card__val--${latestAutomationPolicy.allowExternalExecution ? "ok" : "warn"}`}>
                        {latestAutomationPolicy.allowExternalExecution ? "許可" : "無効"}
                      </span>
                    </div>
                    <div className="card__row">
                      <span className="card__key">最新の安全判定</span>
                      <span className={`card__val card__val--${moderationTone(latestModeration)}`}>
                        {formatModerationSummary(latestModeration)}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {settingsSection === "avatar" && (
                <>
                  <div className="card">
                    <div className="card__header">
                      <div>
                        <p className="card__title">Avatar</p>
                        <p className="card__hint card__hint--compact">モデル切替と MotionPNGTuber 調整をここに集約します。</p>
                      </div>
                      <span className={`info-chip info-chip--${motionPngTone(motionPngAssetStatus)}`}>
                        {motionPngStatusLabel(motionPngAssetStatus)}
                      </span>
                    </div>
                    <div className="field-group">
                      <label className="field">
                        <span className="card__key">モデル</span>
                        <select
                          className="field__input"
                          value={avatarMode}
                          onChange={(e) => onAvatarModeChange(e.target.value as AvatarMode)}
                        >
                          <option value="svg">SVG</option>
                          <option value="motionpng">MotionPNGTuber</option>
                        </select>
                      </label>
                    </div>
                    {avatarMode === "motionpng" && (
                      <>
                        <div className="composer__actions motionpng-actions">
                          <button className="btn btn--primary" type="button" onClick={onMotionPngFolderSelect}>
                            フォルダを選択
                          </button>
                          <button
                            className="btn btn--secondary"
                            type="button"
                            onClick={handleMotionPngClear}
                            disabled={!motionPngFolderLabel && !motionPngAssetStatus.message}
                          >
                            クリア
                          </button>
                        </div>
                        <div className="card__row">
                          <span className="card__key">選択中</span>
                          <span className="card__val">{motionPngFolderLabel ?? "未選択"}</span>
                        </div>
                        {motionPngAssetStatus.message && (
                          <p className={`motionpng-status motionpng-status--${motionPngTone(motionPngAssetStatus)}`}>
                            {motionPngAssetStatus.message}
                          </p>
                        )}
                        <div className="field-group field-group--motionpng">
                          <label className="field">
                            <span className="card__key">感度 {motionPngSettings.sensitivity}</span>
                            <input
                              className="field__input field__input--range"
                              type="range"
                              min={0}
                              max={100}
                              value={motionPngSettings.sensitivity}
                              onChange={(e) =>
                                onMotionPngSettingChange({ sensitivity: Number.parseInt(e.target.value, 10) })
                              }
                            />
                          </label>
                          <label className="field">
                            <span className="card__key">拡大率 {motionPngSettings.scale.toFixed(2)}x</span>
                            <input
                              className="field__input field__input--range"
                              type="range"
                              min={0.5}
                              max={1.8}
                              step={0.01}
                              value={motionPngSettings.scale}
                              onChange={(e) => onMotionPngSettingChange({ scale: Number.parseFloat(e.target.value) })}
                            />
                          </label>
                        </div>
                        <div className="field-group field-group--motionpng">
                          <label className="field">
                            <span className="card__key">横位置 {motionPngSettings.offsetX}px</span>
                            <input
                              className="field__input field__input--range"
                              type="range"
                              min={-320}
                              max={320}
                              step={4}
                              value={motionPngSettings.offsetX}
                              onChange={(e) =>
                                onMotionPngSettingChange({ offsetX: Number.parseInt(e.target.value, 10) })
                              }
                            />
                          </label>
                          <label className="field">
                            <span className="card__key">縦位置 {motionPngSettings.offsetY}px</span>
                            <input
                              className="field__input field__input--range"
                              type="range"
                              min={-320}
                              max={320}
                              step={4}
                              value={motionPngSettings.offsetY}
                              onChange={(e) =>
                                onMotionPngSettingChange({ offsetY: Number.parseInt(e.target.value, 10) })
                              }
                            />
                          </label>
                        </div>
                        <div className="card__row">
                          <span className="card__key">HQ Audio</span>
                          <label className="toggle">
                            <input
                              type="checkbox"
                              checked={motionPngSettings.hqAudioEnabled}
                              onChange={(e) => onMotionPngSettingChange({ hqAudioEnabled: e.target.checked })}
                            />
                            <span className="toggle__slider" />
                          </label>
                        </div>
                        <div className="card__row">
                          <span className="card__key">クロマキー</span>
                          <label className="toggle">
                            <input
                              type="checkbox"
                              checked={motionPngSettings.chromaKeyEnabled}
                              onChange={(e) => onMotionPngSettingChange({ chromaKeyEnabled: e.target.checked })}
                            />
                            <span className="toggle__slider" />
                          </label>
                        </div>
                        <div className="field-group field-group--motionpng">
                          <label className="field">
                            <span className="card__key">キー色</span>
                            <input
                              className="field__input field__input--color"
                              type="color"
                              value={motionPngSettings.chromaKeyColor}
                              onChange={(e) => onMotionPngSettingChange({ chromaKeyColor: e.target.value })}
                            />
                          </label>
                          <label className="field">
                            <span className="card__key">しきい値 {motionPngSettings.chromaKeyThreshold}</span>
                            <input
                              className="field__input field__input--range"
                              type="range"
                              min={0}
                              max={220}
                              value={motionPngSettings.chromaKeyThreshold}
                              onChange={(e) =>
                                onMotionPngSettingChange({ chromaKeyThreshold: Number.parseInt(e.target.value, 10) })
                              }
                            />
                          </label>
                          <label className="field">
                            <span className="card__key">フェザー {motionPngSettings.chromaKeyFeather}</span>
                            <input
                              className="field__input field__input--range"
                              type="range"
                              min={1}
                              max={120}
                              value={motionPngSettings.chromaKeyFeather}
                              onChange={(e) =>
                                onMotionPngSettingChange({ chromaKeyFeather: Number.parseInt(e.target.value, 10) })
                              }
                            />
                          </label>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="card">
                    <div className="card__header">
                      <div>
                        <p className="card__title">Background</p>
                        <p className="card__hint card__hint--compact">ステージ背景の差し替えをここで行います。</p>
                      </div>
                    </div>
                    <div className="composer__actions background-actions">
                      <button className="btn btn--primary" type="button" onClick={onBackgroundSelect}>
                        背景を選択
                      </button>
                      <button
                        className="btn btn--secondary"
                        type="button"
                        onClick={handleBackgroundClear}
                        disabled={!backgroundAssetLabel}
                      >
                        クリア
                      </button>
                    </div>
                    <div className="card__row">
                      <span className="card__key">状態</span>
                      <span className={`card__val card__val--${backgroundAssetLabel ? "ok" : "warn"}`}>
                        {backgroundAssetLabel ? "差し替え中" : "デフォルト"}
                      </span>
                    </div>
                    <div className="card__row">
                      <span className="card__key">選択中</span>
                      <span className="card__val">
                        {backgroundAssetLabel
                          ? `${backgroundAssetKind === "video" ? "動画" : "画像"} · ${backgroundAssetLabel}`
                          : "未選択"}
                      </span>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card__header">
                      <div>
                        <p className="card__title">VOICEVOX</p>
                        <p className="card__hint card__hint--compact">音声ON/OFFと接続状態を確認します。</p>
                      </div>
                    </div>
                    <div className="card__row">
                      <span className="card__key">音声発話</span>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={voiceEnabled}
                          onChange={(e) => onVoiceEnabledChange(e.target.checked)}
                        />
                        <span className="toggle__slider" />
                      </label>
                    </div>
                    <div className="card__row">
                      <span className="card__key">接続状態</span>
                      <span className={`card__val card__val--${voicevoxHealth?.ok ? "ok" : "warn"}`}>
                        {voiceSummary}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {settingsSection === "advanced" && (
                <>
                  <div className="card">
                    <div className="card__header">
                      <div>
                        <p className="card__title">{characterProfile.profileHeading}</p>
                        <p className="card__hint card__hint--compact">現在の世界観・役割の確認用です。</p>
                      </div>
                    </div>
                    <dl className="profile-list">
                      {characterProfileHighlights.map((item) => (
                        <li key={item.label}>
                          <dt>{item.label}</dt>
                          <dd>{item.value}</dd>
                        </li>
                      ))}
                    </dl>
                  </div>

                  <div className="card">
                    <div className="card__header">
                      <div>
                        <p className="card__title">情報</p>
                        <p className="card__hint card__hint--compact">アプリとキャラクターの基本情報です。</p>
                      </div>
                    </div>
                    <div className="card__row">
                      <span className="card__key">アプリ</span>
                      <span className="card__val">{characterProfile.appName}</span>
                    </div>
                    <div className="card__row">
                      <span className="card__key">キャラクター</span>
                      <span className="card__val">{characterProfile.englishName}</span>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </>
      </div>
    </aside>
  )
}

function platformTargetLabel(mode: PlatformChatMode) {
  switch (mode) {
    case "youtube":
      return "配信URL / video ID"
    case "twitch":
      return "チャンネル名"
    case "kick":
      return "チャンネル名"
  }
}

function platformTargetPlaceholder(mode: PlatformChatMode) {
  switch (mode) {
    case "youtube":
      return "https://www.youtube.com/watch?v=... または video ID"
    case "twitch":
      return "例: shroud"
    case "kick":
      return "例: xqc"
  }
}

function describeLastEventAge(value: string | null) {
  if (!value) {
    return "未受信"
  }

  const timestamp = Date.parse(value)

  if (Number.isNaN(timestamp)) {
    return "不明"
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))

  if (diffSeconds < 10) {
    return "たった今"
  }

  if (diffSeconds < 60) {
    return `${diffSeconds}秒前`
  }

  const diffMinutes = Math.floor(diffSeconds / 60)

  if (diffMinutes < 60) {
    return `${diffMinutes}分前`
  }

  const diffHours = Math.floor(diffMinutes / 60)

  if (diffHours < 24) {
    return `${diffHours}時間前`
  }

  return `${Math.floor(diffHours / 24)}日前`
}

function formatModerationSummary(assessment: ModerationAssessment | null) {
  if (!assessment) {
    return "未評価"
  }

  if (assessment.disposition === "allow") {
    return "問題なし"
  }

  const categories = assessment.categories.join(", ")
  return categories ? `${assessment.disposition} · ${categories}` : assessment.disposition
}

function moderationTone(assessment: ModerationAssessment | null) {
  if (!assessment) {
    return "warn"
  }

  switch (assessment.disposition) {
    case "allow":
      return "ok"
    case "review":
      return "warn"
    case "block":
      return "err"
  }
}

function motionPngStatusLabel(status: MotionPngAssetStatus) {
  if (status.tone === "loading") {
    return "読み込み中"
  }

  if (status.loaded) {
    return "読み込み済み"
  }

  if (status.tone === "error") {
    return "エラー"
  }

  return "未設定"
}

function motionPngTone(status: MotionPngAssetStatus) {
  switch (status.tone) {
    case "success":
      return "ok"
    case "error":
      return "err"
    case "loading":
      return "warn"
    default:
      return "warn"
  }
}

function describeCharacterSinLabel(name: CharacterSinName) {
  switch (name) {
    case "pride":
      return "Pride"
    case "greed":
      return "Greed"
    case "envy":
      return "Envy"
    case "wrath":
      return "Wrath"
    case "sloth":
      return "Sloth"
    case "lust":
      return "Lust"
    case "gluttony":
      return "Gluttony"
  }
}

function describeCharacterSinHint(name: CharacterSinName) {
  switch (name) {
    case "pride":
      return "主役感・気品の強さ"
    case "greed":
      return "もっと構いたくなる配信欲"
    case "envy":
      return "特別扱いしたくなる距離感"
    case "wrath":
      return "境界線を引く鋭さ"
    case "sloth":
      return "くつろいだ間合い"
    case "lust":
      return "上品な甘やかしと小悪魔感"
    case "gluttony":
      return "ご褒美感・満足感の濃さ"
  }
}

function formatRuntimeKind(kind: string) {
  switch (kind) {
    case "status":
      return "STATUS"
    case "task":
      return "TASK"
    case "tool":
      return "TOOL"
    case "action":
      return "ACTION"
    case "filter":
      return "TRIAGE"
    case "autoreply":
      return "AUTO"
    case "voice":
      return "VOICE"
    case "error":
      return "ERROR"
    default:
      return kind.toUpperCase()
  }
}
