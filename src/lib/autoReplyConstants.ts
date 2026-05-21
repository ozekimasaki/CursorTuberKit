// 音声セグメント間の自然な間。短すぎると詰まり、長すぎると間延びする。
export const QUEUED_PLAYBACK_GAP_MS = 350
// 視聴者コメントのキュー上限。これを超えると backlog spiral になりやすい。
export const MAX_QUEUED_VIEWER_EVENTS = 12
// 自動返信の再試行回数（abort 以外の失敗時）。
export const MAX_AUTO_REPLY_RETRY_ATTEMPTS = 2
// 返信生成の並列度。playback は直列だが、生成は先回りで並列化して "次ネタ待ち" を短縮する。
export const MAX_CONCURRENT_AUTO_REPLY_GENERATIONS = 2
// コメントをまとめて返すトリガー件数。これに達したら compact 返信に切り替える。
export const COMPACT_REPLY_TRIGGER_COUNT = 6
// 1 回の compact 返信で扱うコメント数の上限。これ以上は AI が破綻しやすい。
export const COMPACT_REPLY_BATCH_SIZE = 6
// 「コメント順番に読んでいくね」を挟むまでの待ち時間。視聴者に preview を見せる余白。
export const AUTO_REPLY_BRIDGE_DELAY_MS = 1200
export const AUTO_REPLY_BRIDGE_TEXT = "コメント順番に読んでいくね。"
// 直近何ターンを文脈として AI に渡すか。context 窓と質のバランスから 8 が経験則。
export const RECENT_TURNS_CONTEXT_SIZE = 8
// runtime activity 表示の最大件数（古いものから捨てる）。
export const MAX_RUNTIME_ACTIVITY_ITEMS = 6

// 音声合成セグメンテーションの閾値:
// VOICEVOX は 50 文字前後で最も自然に発話できるため、句読点で適切に分割する。
// MIN_LEN_FOR_PAUSE_SPLIT (26): これ未満は pause で分割せず溜める（細切れ防止）
// MIN_PREFIX_BEFORE_PAUSE (14): 句読点前の最小プレフィックス（自然なフレーズ境界の保証）
// MAX_LEN_BEFORE_FORCE_SPLIT (44): これを超えたら強制分割（合成待ちと記憶負荷の抑制）
// FORCE_SPLIT_POSITION (24): 強制分割時の位置（残り 20 文字以上を確保）
export const MIN_LEN_FOR_PAUSE_SPLIT = 26
export const MIN_PREFIX_BEFORE_PAUSE = 14
export const MAX_LEN_BEFORE_FORCE_SPLIT = 44
export const FORCE_SPLIT_POSITION = 24
