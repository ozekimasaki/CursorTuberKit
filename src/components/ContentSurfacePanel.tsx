import { ArrowRight } from "lucide-react"
import type { CharacterContentSurface } from "../lib/contentSurface"

type ContentSurfacePanelProps = {
  busy: boolean
  onUseSuggestion?: (prompt: string) => void
  surface: CharacterContentSurface
  variant?: "dock" | "overlay"
}

export function ContentSurfacePanel({
  busy,
  onUseSuggestion,
  surface,
  variant = "dock",
}: ContentSurfacePanelProps) {
  return (
    <section
      className={`content-surface content-surface--${variant}`}
      aria-label="キャラクターコンテンツ"
    >
      <header className="content-surface__head">
        <h3 className="content-surface__title">自動進行の返答面</h3>
        <span className="content-surface__provider">{surface.tone.label}</span>
      </header>

      <p className="content-surface__meta">{surface.providerSummary}</p>
      <p className="content-surface__meta">
        自動返答 ON 中は、コメントの合間にここから自動でネタ面を差し込みます。
        {variant === "dock" && onUseSuggestion ? " 手動ボタンは確認用のフォールバックです。" : ""}
      </p>

      {surface.capabilityBadges.length > 0 && (
        <div className="content-surface__badges">
          {surface.capabilityBadges.map((badge) => (
            <span key={badge} className="content-surface__badge">
              {badge}
            </span>
          ))}
        </div>
      )}

      <dl className="content-surface__insights">
        <div className="content-surface__insight">
          <dt>tone</dt>
          <dd>{surface.tone.detail}</dd>
        </div>
        <div className="content-surface__insight">
          <dt>callback</dt>
          <dd>{surface.callbackHint}</dd>
        </div>
        <div className="content-surface__insight">
          <dt>relation</dt>
          <dd>{surface.relationHint}</dd>
        </div>
      </dl>

      <ul className="content-surface__grid">
        {surface.suggestions.map((suggestion) => (
          <li key={suggestion.id} className="content-surface__item">
            <div className="content-surface__item-head">
              <h4 className="content-surface__item-title">{suggestion.title}</h4>
              {variant === "dock" && onUseSuggestion ? (
                <button
                  className="btn btn--ghost btn--sm content-surface__item-action"
                  type="button"
                  disabled={busy}
                  onClick={() => onUseSuggestion(suggestion.prompt)}
                >
                  <span>{busy ? "応答中…" : "手動で使う"}</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <p className="content-surface__item-summary">{suggestion.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
