import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react"
import { characterProfile, characterProfileHighlights } from "../../shared/characterProfile"
import type {
  PlatformChatMode,
  PlatformChatState,
  PlatformViewerEvent,
} from "../../shared/platformChat"
import { type StreamStatus } from "../App"
import { type VoicevoxHealth } from "../lib/voicevox"

type ControlDockProps = {
  open: boolean
  onClose: () => void
  errorMessage: string | null
  onCancel: () => void
  onSubmit: (prompt: string) => void
  onVoiceEnabledChange: (enabled: boolean) => void
  responseText: string
  status: StreamStatus
  voiceEnabled: boolean
  voicevoxHealth: VoicevoxHealth | null
  platformMode: PlatformChatMode
  platformTarget: string
  platformState: PlatformChatState
  liveViewerEvents: PlatformViewerEvent[]
  autoReplyEnabled: boolean
  onAutoReplyEnabledChange: (enabled: boolean) => void
  onPlatformModeChange: (mode: PlatformChatMode) => void
  onPlatformStart: () => void
  onPlatformStop: () => void
  onPlatformTargetChange: (target: string) => void
}

type DockTab = "compose" | "transcript" | "settings"

export function ControlDock({
  open,
  onClose,
  errorMessage,
  onCancel,
  onSubmit,
  onVoiceEnabledChange,
  responseText,
  status,
  voiceEnabled,
  voicevoxHealth,
  platformMode,
  platformTarget,
  platformState,
  liveViewerEvents,
  autoReplyEnabled,
  onAutoReplyEnabledChange,
  onPlatformModeChange,
  onPlatformStart,
  onPlatformStop,
  onPlatformTargetChange,
}: ControlDockProps) {
  const [prompt, setPrompt] = useState("")
  const [tab, setTab] = useState<DockTab>("compose")
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

  return (
    <aside className={`dock${open ? " dock--open" : ""}`} aria-hidden={!open} aria-label="操作ドック">
      <header className="dock__header">
        <div>
          <h2 className="dock__title">{characterProfile.panelHeading}</h2>
          <p className="dock__sub">{characterProfile.tagline}</p>
        </div>
        <button className="dock__close" onClick={onClose} aria-label="ドックを閉じる" type="button">
          ×
        </button>
      </header>

      <nav className="dock__tabs" role="tablist">
        {([
          ["compose", "コメント"],
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
        {tab === "compose" && (
          <>
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
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={autoReplyEnabled}
                    onChange={(e) => onAutoReplyEnabledChange(e.target.checked)}
                  />
                  <span className="toggle__slider" />
                </label>
              </div>
              <p className="card__hint">返答はこのアプリ内でのみ再生・表示されます。各サービスへの自動投稿はまだ行いません。</p>
            </div>

            <div className="card">
              <p className="card__title">受信コメント</p>
              {liveViewerEvents.length > 0 ? (
                <div className="event-feed">
                  {liveViewerEvents.map((event) => (
                    <article
                      key={event.id}
                      className={`event-item${event.isMonetized ? " event-item--monetized" : ""}`}
                    >
                      <div className="event-item__head">
                        <span className="event-item__badge">{eventLabel(event)}</span>
                        <strong className="event-item__author">{event.authorName}</strong>
                        {event.monetization?.amountText && (
                          <span className="event-item__money">{event.monetization.amountText}</span>
                        )}
                      </div>
                      <p className="event-item__text">{event.text}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="event-feed__empty">まだ配信コメントは受信していません。</p>
              )}
            </div>

            <form className="composer" onSubmit={handleSubmit}>
              <p className="card__title">Manual Fallback</p>
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
          </>
        )}

        {tab === "transcript" && (
          <div
            className={`transcript${responseText ? "" : " transcript--placeholder"}`}
            aria-live="polite"
          >
            {responseText || characterProfile.transcriptPlaceholder}
          </div>
        )}

        {tab === "settings" && (
          <>
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

function eventLabel(event: PlatformViewerEvent) {
  switch (event.kind) {
    case "comment":
      return event.platform.toUpperCase()
    case "superchat":
      return "SUPER CHAT"
    case "paid_sticker":
      return "PAID STICKER"
    case "membership":
      return "MEMBERSHIP"
    case "subscription":
      return "SUB"
    case "gift_subscription":
      return "GIFT"
    case "cheer":
      return "CHEER"
    case "hype_chat":
      return "HYPE CHAT"
  }
}
