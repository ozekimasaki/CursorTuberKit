import type { AutopilotOpenThread } from "../../shared/autopilot"

type ConversationTurnLike = {
  role: "assistant" | "user"
  text: string
}

const MIN_FREQUENCY = 2
const RECENT_TURN_RESOLVED_WINDOW = 3
const MAX_THREADS = 3
const ASSISTANT_TURN_WINDOW = 12
const SNIPPET_CHAR_CAP = 60

// Stop words: generic conversational fillers, viewer/stream meta terms, and
// vague pronouns that would produce noisy callbacks if treated as "threads".
const STOP_WORDS = new Set<string>([
  "配信", "コメント", "視聴者", "ROM", "リスナー", "チャット",
  "自分", "自分自身", "今日", "今回", "最近", "ちょっと", "みたい",
  "感じ", "もの", "それ", "あれ", "これ", "みんな", "ここ", "そこ",
  "とき", "とこ", "場合", "ため", "よう", "やつ", "話", "話題",
  "AI", "プロンプト", "モード", "ツール",
])

const KATAKANA_REGEX = /[\u30A0-\u30FFー]{2,}/g
const KANJI_REGEX = /[\u4E00-\u9FFF々]{2,}/g
const ALNUM_REGEX = /[A-Za-z][A-Za-z0-9]{2,}/g

/**
 * Extract "open threads": topical tags the assistant raised in the past but did
 * not touch in the most recent few turns. These are weak hints — the planner
 * uses them only when natural to call back. Conservative thresholds (assistant
 * turns only, freq>=2, stopword filter, recent-window exclusion) keep false
 * positives down.
 */
export function extractOpenThreads(turns: readonly ConversationTurnLike[]): AutopilotOpenThread[] {
  const assistantTurns = turns.filter((turn) => turn.role === "assistant")
  if (assistantTurns.length < 2) {
    return []
  }

  const window = assistantTurns.slice(-ASSISTANT_TURN_WINDOW)
  const totalTurns = window.length
  const recentCutoff = Math.max(0, totalTurns - RECENT_TURN_RESOLVED_WINDOW)

  type TagStat = {
    tag: string
    count: number
    lastSeenTurnIndex: number
    snippet: string
  }

  const stats = new Map<string, TagStat>()

  window.forEach((turn, index) => {
    const text = turn.text ?? ""
    if (!text) return
    const tags = extractTags(text)
    for (const tag of tags) {
      const existing = stats.get(tag)
      if (existing) {
        existing.count += 1
        existing.lastSeenTurnIndex = index
        existing.snippet = makeSnippet(text)
      } else {
        stats.set(tag, {
          tag,
          count: 1,
          lastSeenTurnIndex: index,
          snippet: makeSnippet(text),
        })
      }
    }
  })

  const candidates: TagStat[] = []
  for (const stat of stats.values()) {
    if (stat.count < MIN_FREQUENCY) continue
    if (stat.lastSeenTurnIndex >= recentCutoff) continue
    candidates.push(stat)
  }

  candidates.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.lastSeenTurnIndex - b.lastSeenTurnIndex
  })

  return candidates.slice(0, MAX_THREADS).map((stat) => ({
    tag: stat.tag,
    snippet: stat.snippet,
    lastSeenTurnIndex: stat.lastSeenTurnIndex,
  }))
}

function extractTags(text: string): Set<string> {
  const tags = new Set<string>()
  const matches = [
    ...(text.match(KATAKANA_REGEX) ?? []),
    ...(text.match(KANJI_REGEX) ?? []),
    ...(text.match(ALNUM_REGEX) ?? []),
  ]
  for (const raw of matches) {
    const normalized = raw.trim()
    if (!normalized) continue
    if (normalized.length > 16) continue
    if (STOP_WORDS.has(normalized)) continue
    tags.add(normalized)
  }
  return tags
}

function makeSnippet(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim()
  return normalized.length > SNIPPET_CHAR_CAP
    ? `${normalized.slice(0, SNIPPET_CHAR_CAP - 1)}…`
    : normalized
}
