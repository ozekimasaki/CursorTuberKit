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
    <section className={`content-surface content-surface--${variant}`} aria-label="キャラクターコンテンツ">
      <div className="content-surface__head">
        <div>
          <p className="content-surface__eyebrow">CHARACTER CONTENT</p>
          <h3 className="content-surface__title">自動進行の返答面</h3>
        </div>
        <span className={`runtime-chip runtime-chip--${surface.tone.tone}`}>{surface.tone.label}</span>
      </div>

      <p className="content-surface__provider">{surface.providerSummary}</p>
      <p className="content-surface__provider">
        自動返答 ON 中は、コメントの合間にここから自動でネタ面を差し込みます。
        {variant === "dock" && onUseSuggestion ? " 手動ボタンは確認用のフォールバックです。" : ""}
      </p>

      <div className="content-surface__meta">
        {surface.capabilityBadges.map((badge) => (
          <span key={badge} className="info-chip info-chip--muted">
            {badge}
          </span>
        ))}
      </div>

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

      <div className="content-surface__grid">
        {surface.suggestions.map((suggestion) => (
          <article key={suggestion.id} className="content-surface__item">
            <div className="content-surface__item-head">
              <p className="content-surface__item-title">{suggestion.title}</p>
              <span className={`runtime-chip runtime-chip--${suggestion.tone}`}>{suggestion.id}</span>
            </div>
            <p className="content-surface__item-summary">{suggestion.summary}</p>
            {variant === "dock" && onUseSuggestion ? (
              <button
                className="btn btn--ghost content-surface__item-action"
                type="button"
                disabled={busy}
                onClick={() => onUseSuggestion(suggestion.prompt)}
              >
                {busy ? "応答中…" : "必要なら手動差し込み"}
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}
