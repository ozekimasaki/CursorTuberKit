import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react"
import { characterProfile, characterProfileHighlights } from "../../shared/characterProfile"
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
}: ControlDockProps) {
  const [prompt, setPrompt] = useState("")
  const [tab, setTab] = useState<DockTab>("compose")
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const isBusy = status === "thinking" || status === "synthesizing" || status === "playing"
  const canSubmit = !isBusy && prompt.trim().length > 0

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
          ["compose", "プロンプト"],
          ["transcript", "応答"],
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
          <form className="composer" onSubmit={handleSubmit}>
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
