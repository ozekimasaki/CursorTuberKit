import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react"
import { describeAutomationExecutionLevel, type AutomationPolicy } from "../../shared/automation"
import { characterProfile, characterProfileHighlights } from "../../shared/characterProfile"
import type { ModerationAssessment } from "../../shared/moderation"
import type {
  PlatformChatMode,
  PlatformChatState,
  PlatformViewerEvent,
} from "../../shared/platformChat"
import { type RuntimeTone, type StreamRuntimeActivity, type StreamStatus } from "../App"
import type { AvatarMode, MotionPngAssetStatus, MotionPngSettings } from "../lib/avatarConfig"
import type { CharacterContentSurface } from "../lib/contentSurface"
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
  motionPngAssetStatus: MotionPngAssetStatus
  motionPngFolderLabel: string | null
  motionPngSettings: MotionPngSettings
  streamScreenMode: boolean
  onAutoReplyEnabledChange: (enabled: boolean) => void
  onPlatformModeChange: (mode: PlatformChatMode) => void
  onPlatformStart: () => void
  onPlatformStop: () => void
  onPlatformTargetChange: (target: string) => void
  onUseContentSuggestion: (prompt: string) => void
}

type DockTab = "comments" | "content" | "compose" | "transcript" | "settings"

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
  motionPngAssetStatus,
  motionPngFolderLabel,
  motionPngSettings,
  streamScreenMode,
  onAutoReplyEnabledChange,
  onPlatformModeChange,
  onPlatformStart,
  onPlatformStop,
  onPlatformTargetChange,
  onUseContentSuggestion,
}: ControlDockProps) {
  const [prompt, setPrompt] = useState("")
  const [tab, setTab] = useState<DockTab>("comments")
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

  const commentsPanel = (
    <div className="card comments-panel">
      <p className="card__title">受信コメント</p>
      <p className="card__hint">
        配信画面モードに切り替えると、このコメント一覧だけを画面上に浮かせて表示できます。
      </p>
      <div className="card__meta">
        <span className={`info-chip info-chip--${isPlatformConnected ? "ok" : isPlatformConnecting ? "warn" : "muted"}`}>
          {platformSummary}
        </span>
        <span className={`info-chip info-chip--${autoReplyEnabled ? "ok" : "muted"}`}>
          自動返答 {autoReplyEnabled ? "ON" : "OFF"}
        </span>
      </div>
      <ViewerEventFeed events={liveViewerEvents} />
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
            {streamScreenMode ? "表示中" : "配信画面"}
          </button>
          <button className="dock__close" onClick={onClose} aria-label="ドックを閉じる" type="button">
            ×
          </button>
        </div>
      </header>

      <nav className="dock__tabs" role="tablist">
        {([
          ["comments", "受信"],
          ["content", "ネタ面"],
          ["compose", "手動"],
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
          {tab === "comments" && commentsPanel}

          {tab === "compose" && (
            <form className="card composer composer-card" onSubmit={handleSubmit}>
              <p className="card__title">Manual Fallback</p>
              <p className="card__hint">
                配信コメントと切り分けて、必要なときだけ手動で話しかけられます。
              </p>
              <div className="composer__meta">
                <span>Ctrl / Cmd + Enter で送信</span>
                <span>{prompt.length} / 4000</span>
              </div>
              <textarea
                ref={textareaRef}
                aria-label={characterProfile.promptLabel}
                maxLength={4000}
                placeholder={characterProfile.promptPlaceholder}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={5}
              />
              <div className="composer__actions">
                <button className="btn btn--primary" type="submit" disabled={!canSubmit}>
                  {isBusy ? "応答中…" : "送信"}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => setPrompt("")}
                  disabled={isBusy || !prompt}
                >
                  クリア
                </button>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={onCancel}
                  disabled={!isBusy}
                >
                  中断
                </button>
              </div>
            </form>
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
                <p className="card__title">現在の字幕</p>
                <p className="card__hint">
                  いま配信に出ている発話テキストをここで確認できます。
                </p>
                <div
                  className={`transcript transcript-card__body${responseText ? "" : " transcript--placeholder"}`}
                  aria-live="polite"
                >
                  {responseText || characterProfile.transcriptPlaceholder}
                </div>
              </div>

              <div className="card runtime-card">
                <p className="card__title">実行状況</p>
                <div className="runtime-card__summary">
                  <span className={`runtime-chip runtime-chip--${runtimeTone}`}>{runtimeLabel}</span>
                  {runtimeDetail && <p className="runtime-card__detail">{runtimeDetail}</p>}
                </div>
                {runtimeActivities.length > 0 ? (
                  <ol className="runtime-log">
                    {runtimeActivities.map((activity) => (
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
            </>
          )}

          {tab === "settings" && (
            <>
              <div className="card">
                <p className="card__title">Avatar</p>
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
                <div className="card__row">
                  <span className="card__key">状態</span>
                  <span className={`card__val card__val--${motionPngTone(motionPngAssetStatus)}`}>
                    {motionPngStatusLabel(motionPngAssetStatus)}
                  </span>
                </div>
                {avatarMode === "motionpng" && (
                  <>
                    <div className="composer__actions motionpng-actions">
                      <button className="btn btn--primary" type="button" onClick={onMotionPngFolderSelect}>
                        フォルダを選択
                      </button>
                      <button
                        className="btn"
                        type="button"
                        onClick={onMotionPngClear}
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
                    <p className="card__hint">
                      MotionPNGTuber は folder picker でアセットを読み込みます。動画ベースなので、緑背景などはクロマキーで抜きながら位置とサイズを調整できます。
                    </p>
                  </>
                )}
              </div>

              <div className="card">
                <p className="card__title">Background</p>
                <div className="composer__actions background-actions">
                  <button className="btn btn--primary" type="button" onClick={onBackgroundSelect}>
                    背景を選択
                  </button>
                  <button className="btn" type="button" onClick={onBackgroundClear} disabled={!backgroundAssetLabel}>
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
                <p className="card__hint">
                  画像と動画のどちらでも stage 背景を差し替えられます。動画はミュート・ループ再生されます。
                </p>
              </div>

              <div className="card">
                <p className="card__title">Live Chat Mode</p>
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
                  <button className="btn" type="button" onClick={onPlatformStop} disabled={!isPlatformConnected && !isPlatformConnecting}>
                    切断
                  </button>
                </div>
                <div className="card__row">
                  <span className="card__key">状態</span>
                  <span className={`card__val card__val--${platformState.status === "error" ? "err" : platformState.status === "connected" ? "ok" : "warn"}`}>
                    {platformSummary}
                  </span>
                </div>
                <div className="card__row">
                  <span className="card__key">自動返答</span>
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
                      {autoReplyEnabled ? "ON" : "OFF"}
                    </span>
                  </button>
                </div>
                <p className="card__hint">
                  発話中も裏で返答を生成して順次キューします。返答はこのアプリ内でのみ再生・表示され、各サービスへの自動投稿はまだ行いません。
                </p>
              </div>

              <div className="card">
                <p className="card__title">Automation Safety</p>
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
                <p className="card__hint">
                  block 判定以外はアプリ内で自動進行し、外部サービスへの自動投稿はまだ行いません。
                </p>
              </div>

              <div className="card">
                <p className="card__title">VOICEVOX</p>
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

              <div className="card">
                <p className="card__title">{characterProfile.profileHeading}</p>
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
                <p className="card__title">情報</p>
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

        {errorMessage && (
          <div className="card" role="alert" style={{ borderColor: "rgb(255 111 138 / 50%)" }}>
            <p className="card__title" style={{ color: "var(--err)" }}>エラー</p>
            <p style={{ margin: 0, color: "#ffd7df", lineHeight: 1.6, fontSize: "0.88rem" }}>
              {errorMessage}
            </p>
          </div>
        )}
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
