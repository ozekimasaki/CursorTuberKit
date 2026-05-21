export const LEXICAL_OVERLAP_PENALTY_THRESHOLD = 0.45

/**
 * Lexical overlap between the new summary and recent assistant turns. Returns
 * a value in [0, 1] where higher means more repetition (= less novel).
 */
export function computeLexicalOverlapPenalty(summary: string, recentTurns: readonly string[]): number {
  if (!summary || recentTurns.length === 0) return 0
  const summaryGrams = toCharNGrams(summary, 3)
  if (summaryGrams.size === 0) return 0
  const corpus = new Set<string>()
  for (const turn of recentTurns.slice(-6)) {
    for (const gram of toCharNGrams(turn, 3)) {
      corpus.add(gram)
    }
  }
  if (corpus.size === 0) return 0
  let overlap = 0
  for (const gram of summaryGrams) {
    if (corpus.has(gram)) overlap += 1
  }
  return overlap / summaryGrams.size
}

export function applyLexicalPenalty(score: number, overlap: number): number {
  if (overlap < LEXICAL_OVERLAP_PENALTY_THRESHOLD) return score
  const factor = Math.max(0.4, 1 - (overlap - LEXICAL_OVERLAP_PENALTY_THRESHOLD) * 1.1)
  return Math.max(0, Math.min(100, Math.round(score * factor)))
}

export function toCharNGrams(text: string, n: number): Set<string> {
  const normalized = text.replace(/\s+/g, "")
  const set = new Set<string>()
  if (normalized.length < n) return set
  for (let i = 0; i <= normalized.length - n; i += 1) {
    set.add(normalized.slice(i, i + n))
  }
  return set
}
