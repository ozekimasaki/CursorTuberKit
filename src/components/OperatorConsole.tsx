import { FormEvent, KeyboardEvent, useEffect, useRef, useState, type ForwardedRef } from "react"
import { Send, Settings as SettingsIcon, Square, Volume2, VolumeX } from "lucide-react"
import { characterProfile } from "../../shared/characterProfile"
import type {
  PlatformChatMode,
  PlatformChatState,
  PlatformViewerEvent,
} from "../../shared/platformChat"
import type { AutomationPolicy } from "../../shared/automation"
import type { ModerationAssessment } from "../../shared/moderation"
import { type RuntimeTone, type StreamRuntimeActivity, type StreamStatus } from "../lib/runtimeProgress"
import type { AvatarMode, MotionPngAssetStatus, MotionPngSettings, SvgCharacterId } from "../lib/avatarConfig"
import type { CharacterContentSurface } from "../lib/contentSurface"
import type { Emotion } from "../../shared/emotion"
import type { SinExpressionSignal } from "../../shared/sinsExpression"
import type { ConversationTurn } from "../lib/streamAi"
import type { Viseme } from "../lib/visemes"
import type { DopamineState, PersonaMutation } from "../../shared/dopamineMutation"
import { ContentSurfacePanel } from "./ContentSurfacePanel"
import { ViewerEventFeed } from "./ViewerEventFeed"
import { type AvatarState } from "./MaidCatAvatar"
import { SvgAvatar } from "./SvgAvatar"
import { MotionPngAvatar, type MotionPngAvatarHandle } from "./MotionPngAvatar"

type OperatorConsoleProps = {
  // Header / status
  characterName: string
  runtimeLabel: string
  runtimeTone: RuntimeTone
  runtimeDetail: string | null
  status: StreamStatus
  platformState: PlatformChatState
  autoReplyEnabled: boolean
  autoReplyPendingCount: number
  voiceEnabled: boolean
  onVoiceEnabledChange: (enabled: boolean) => void
  onOpenSettings: () => void
  onOpenStagePreview: () => void

  // Avatar
  avatarMode: AvatarMode
  avatarState: AvatarState
  emotion: Emotion
  viseme: Viseme
  motionPngFiles: File[]
  motionPngSettings: MotionPngSettings
  motionPngAvatarRef: ForwardedRef<MotionPngAvatarHandle>
  svgCharacter: SvgCharacterId
  sinSignal?: SinExpressionSignal
  onMotionPngAssetStatusChange: (status: MotionPngAssetStatus) => void

  // Speaking
  responseText: string
  recentTurns: ConversationTurn[]

  // Queue / suggestions
  contentSurface: CharacterContentSurface
  runtimeActivities: StreamRuntimeActivity[]
  onUseContentSuggestion: (prompt: string) => void

  // Comments
  liveViewerEvents: PlatformViewerEvent[]

  // Side: automation / safety / connection
  onAutoReplyEnabledChange: (enabled: boolean) => void
  onCancel: () => void
  latestAutomationPolicy: AutomationPolicy
  latestModeration: ModerationAssessment | null
  platformMode: PlatformChatMode
  platformTarget: string
  onPlatformModeChange: (mode: PlatformChatMode) => void
  onPlatformTargetChange: (target: string) => void
  onPlatformStart: () => void
  onPlatformStop: () => void

  // Compose
  onSubmit: (prompt: string) => void

  // Dopamine mutation
  dopamineState?: DopamineState
  onTriggerManualMutation?: () => void
  onUndoMutation?: () => void
}

export function OperatorConsole(props: OperatorConsoleProps) {
  const {
    characterName,
    runtimeLabel,
    runtimeTone,
    runtimeDetail,
    status,
    platformState,
    autoReplyEnabled,
    autoReplyPendingCount,
    voiceEnabled,
    onVoiceEnabledChange,
    onOpenSettings,
    onOpenStagePreview,
    avatarMode,
    avatarState,
    emotion,
    viseme,
    motionPngFiles,
    motionPngSettings,
    motionPngAvatarRef,
    svgCharacter,
    sinSignal,
    onMotionPngAssetStatusChange,
    responseText,
    recentTurns,
    contentSurface,
    runtimeActivities,
    onUseContentSuggestion,
    liveViewerEvents,
    onAutoReplyEnabledChange,
    onCancel,
    latestAutomationPolicy,
    latestModeration,
    platformMode,
    platformTarget,
    onPlatformModeChange,
    onPlatformTargetChange,
    onPlatformStart,
    onPlatformStop,
    onSubmit,
    dopamineState,
    onTriggerManualMutation,
    onUndoMutation,
  } = props

  const [prompt, setPrompt] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const isBusy = status === "thinking" || status === "synthesizing" || status === "playing"
  const canSubmit = !isBusy && prompt.trim().length > 0
  const isPlatformConnecting = platformState.status === "connecting"
  const isPlatformConnected = platformState.status === "connected"
  const canStartPlatform = !isPlatformConnecting && platformTarget.trim().length > 0

  useEffect(() => {
    document.body.classList.add("operator-mode")
    return () => {
      document.body.classList.remove("operator-mode")
    }
  }, [])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
  }, [prompt])

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (canSubmit) {
      onSubmit(prompt)
      setPrompt("")
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      if (canSubmit) {
        onSubmit(prompt)
        setPrompt("")
      }
    }
  }

  const platformSummary =
    platformState.status === "connected"
      ? `${platformState.mode ?? "chat"} 接続中`
      : platformState.status === "connecting"
        ? "接続中…"
        : platformState.status === "error"
          ? "接続エラー"
          : "未接続"

  const assistantHistory = recentTurns.filter((t) => t.role === "assistant").slice(-3).reverse()

  return (
    <main className="operator" aria-label="Operator console">
      <header className="op-header">
        <div className="op-header__brand">
          <span className={`op-header__dot op-header__dot--${runtimeTone}`} aria-hidden="true" />
          <span>{characterName}</span>
        </div>
        <div className="op-header__status">
          <span>{runtimeLabel}</span>
          <span className="op-header__sep">·</span>
          <span>{platformSummary}</span>
          <span className="op-header__sep">·</span>
          <span>自動返答 {autoReplyEnabled ? "ON" : "OFF"}</span>
          <span className="op-header__sep">·</span>
          <span>処理待ち {autoReplyPendingCount}</span>
        </div>
        <div className="op-header__actions">
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={onOpenStagePreview}
            title="このタブをステージ表示に切り替え"
          >
            ステージ表示
          </button>
          <button
            className="btn btn--ghost btn--icon btn--sm"
            type="button"
            aria-label={voiceEnabled ? "音声をオフ" : "音声をオン"}
            title={voiceEnabled ? "音声: オン" : "音声: オフ"}
            onClick={() => onVoiceEnabledChange(!voiceEnabled)}
          >
            {voiceEnabled ? <Volume2 size={16} aria-hidden /> : <VolumeX size={16} aria-hidden />}
          </button>
          <button
            className="btn btn--ghost btn--icon btn--sm"
            type="button"
            aria-label="設定を開く"
            title="設定"
            onClick={onOpenSettings}
          >
            <SettingsIcon size={16} aria-hidden />
          </button>
        </div>
      </header>

      {/* Avatar */}
      <section className="op-card op-avatar" aria-label="アバタープレビュー">
        <div className="op-card__title">
          <span>Avatar</span>
        </div>
        <div className="op-avatar__frame">
          {avatarMode === "motionpng" ? (
            <MotionPngAvatar
              assetFiles={motionPngFiles}
              onAssetStatusChange={onMotionPngAssetStatusChange}
              ref={motionPngAvatarRef}
              settings={motionPngSettings}
              state={avatarState}
            />
          ) : (
            <SvgAvatar character={svgCharacter} emotion={emotion} state={avatarState} viseme={viseme} sinSignal={sinSignal} />
          )}
        </div>
        {isBusy && (
          <div className="op-avatar__actions">
            <button className="btn btn--danger btn--sm" type="button" onClick={onCancel}>
              <Square size={14} aria-hidden /> 中断
            </button>
          </div>
        )}
      </section>

      {/* Speaking */}
      <section className="op-card op-speaking" aria-label="発話状態">
        <div className="op-card__title">
          <span>Now speaking</span>
        </div>
        <div
          className={`op-speaking__now${responseText ? "" : " op-speaking__now--placeholder"}`}
          aria-live="polite"
        >
          {responseText || characterProfile.transcriptPlaceholder}
        </div>
        {runtimeDetail && (
          <div className="op-row">
            <span className="op-row__label">Detail</span>
            <span className="op-row__val">{runtimeDetail}</span>
          </div>
        )}
        {assistantHistory.length > 0 && (
          <ul className="op-speaking__history" aria-label="直近の返答">
            {assistantHistory.map((turn, index) => (
              <li key={`${index}-${turn.text.slice(0, 20)}`} className="op-speaking__item">
                {turn.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Queue */}
      <section className="op-queue" aria-label="ネタとキュー">
        <ContentSurfacePanel busy={isBusy} onUseSuggestion={onUseContentSuggestion} surface={contentSurface} />
        <div className="op-card">
          <div className="op-card__title">
            <span>Queue</span>
            <small>待機 {autoReplyPendingCount} · 進行ログ</small>
          </div>
          {runtimeActivities.length > 0 ? (
            <ul className="op-queue__list">
              {runtimeActivities.slice(0, 3).map((activity) => (
                <li key={activity.id} className="op-queue__item">
                  <span className="op-queue__kind">{activity.kind.toUpperCase()}</span>
                  {activity.label}
                  {activity.detail && <span> · {activity.detail}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="card__hint">新しいストリームを開始すると進行ログを表示します。</p>
          )}
        </div>
      </section>

      {/* Comments */}
      <section className="op-card op-comments" aria-label="ライブコメント">
        <div className="op-card__title">
          <span>Live comments</span>
          <span className="info-chip info-chip--muted">{liveViewerEvents.length}</span>
        </div>
        <div className="op-comments__body">
          <ViewerEventFeed events={liveViewerEvents} />
        </div>
      </section>

      {/* Side */}
      <aside className="op-side" aria-label="運用設定">
        <div className="op-card">
          <div className="op-card__title">
            <span>Automation</span>
            <small>{autoReplyEnabled ? "ON" : "OFF"}</small>
          </div>
          <div className="op-row">
            <span className="op-row__label">自動返答</span>
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoReplyEnabled}
                onChange={(e) => onAutoReplyEnabledChange(e.target.checked)}
                aria-label="自動返答"
              />
              <span className="toggle__slider" />
            </label>
          </div>
          <div className="op-row">
            <span className="op-row__label">処理待ち</span>
            <span className="op-row__val">{autoReplyPendingCount}</span>
          </div>
        </div>

        <div className="op-card">
          <div className="op-card__title"><span>Safety</span></div>
          <div className="op-row">
            <span className="op-row__label">最大実行Lv</span>
            <span className="op-row__val">{latestAutomationPolicy.maxExecutionLevel}</span>
          </div>
          <div className="op-row">
            <span className="op-row__label">外部投稿</span>
            <span className="op-row__val">{latestAutomationPolicy.allowExternalExecution ? "許可" : "無効"}</span>
          </div>
          <div className="op-row">
            <span className="op-row__label">安全判定</span>
            <span className="op-row__val">{formatModerationShort(latestModeration)}</span>
          </div>
        </div>

        <div className="op-card">
          <div className="op-card__title">
            <span>Connection</span>
            <small>{platformSummary}</small>
          </div>
          <label className="field">
            <span className="field__label">プラットフォーム</span>
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
            <span className="field__label">{platformTargetLabel(platformMode)}</span>
            <input
              className="field__input"
              type="text"
              value={platformTarget}
              placeholder={platformTargetPlaceholder(platformMode)}
              onChange={(e) => onPlatformTargetChange(e.target.value)}
              disabled={isPlatformConnecting}
            />
          </label>
          <div className="composer__actions">
            <button
              className="btn btn--primary btn--sm"
              type="button"
              onClick={onPlatformStart}
              disabled={!canStartPlatform}
            >
              {isPlatformConnected ? "再接続" : isPlatformConnecting ? "接続中…" : "接続"}
            </button>
            <button
              className="btn btn--secondary btn--sm"
              type="button"
              onClick={onPlatformStop}
              disabled={!isPlatformConnected && !isPlatformConnecting}
            >
              切断
            </button>
          </div>
        </div>

        {dopamineState && (
          <div className="op-card">
            <div className="op-card__title">
              <span>Live Mutation</span>
              <small>{dopamineState.phase}</small>
            </div>
            <div className="composer__actions">
              <button
                className="btn btn--primary btn--sm"
                type="button"
                onClick={onTriggerManualMutation}
                disabled={!onTriggerManualMutation}
              >
                変化
              </button>
              <button
                className="btn btn--secondary btn--sm"
                type="button"
                onClick={onUndoMutation}
                disabled={!onUndoMutation || dopamineState.personaHistory.length === 0}
              >
                戻す
              </button>
            </div>
            {dopamineState.personaHistory.length > 0 && (
              <div className="op-row">
                <span className="op-row__label">直近の変化</span>
              </div>
            )}
            {dopamineState.personaHistory.slice(0, 3).map((m) => (
              <div key={m.id} className="op-row">
                <span className="op-row__val" style={{ fontSize: "0.75rem", opacity: 0.8 }}>
                  {m.summary}
                </span>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Compose */}
      <section className="op-card op-compose" aria-label="クイック送信">
        <div className="op-card__title">
          <span>Compose</span>
          <small>Ctrl/Cmd+Enter で送信</small>
        </div>
        <form className="op-compose__form" onSubmit={handleSubmit}>
          <textarea
            className="field__input op-compose__textarea"
            ref={textareaRef}
            aria-label={characterProfile.promptLabel}
            maxLength={4000}
            placeholder={characterProfile.promptPlaceholder}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
          />
          <div className="op-compose__actions">
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              onClick={() => setPrompt("")}
              disabled={isBusy || !prompt}
            >
              クリア
            </button>
            <button className="btn btn--primary btn--sm" type="submit" disabled={!canSubmit}>
              <Send size={14} aria-hidden /> {isBusy ? "応答中…" : "送信"}
            </button>
          </div>
        </form>
        <div className="op-compose__meta">
          <span>{isBusy ? "発話中は待機します" : "待機中"}</span>
          <span>{prompt.length} / 4000</span>
        </div>
      </section>
    </main>
  )
}

function platformTargetLabel(mode: PlatformChatMode) {
  switch (mode) {
    case "youtube": return "配信URL / video ID"
    case "twitch": return "チャンネル名"
    case "kick": return "チャンネル名"
  }
}

function platformTargetPlaceholder(mode: PlatformChatMode) {
  switch (mode) {
    case "youtube": return "https://www.youtube.com/watch?v=... または video ID"
    case "twitch": return "例: shroud"
    case "kick": return "例: xqc"
  }
}

function formatModerationShort(assessment: ModerationAssessment | null) {
  if (!assessment) return "未評価"
  if (assessment.disposition === "allow") return "問題なし"
  return assessment.disposition
}
