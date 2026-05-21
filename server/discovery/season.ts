import type { AutopilotDiscoverySnippet } from "../../shared/autopilot.js"
import { getCached } from "./cache.js"

const CACHE_TTL_MS = 3_600_000

type SeasonalEntry = {
  // 1-indexed month
  month: number
  // optional day window for finer cues (1-indexed). When omitted, applies to whole month.
  fromDay?: number
  toDay?: number
  title: string
  detail: string
}

const SEASONAL_TABLE: SeasonalEntry[] = [
  { month: 1, title: "新年・寒の入り", detail: "正月明けの少し落ち着いた空気。寒中見舞いや七草、温かい飲み物の話題が出やすい時期。" },
  { month: 1, fromDay: 20, toDay: 31, title: "大寒の頃", detail: "一年で最も冷え込む時期。湯気の立つ紅茶や、しんと静まる夜の話題が合う。" },
  { month: 2, fromDay: 1, toDay: 14, title: "立春前後", detail: "暦の上では春。まだ寒いがふと日差しに春を感じる瞬間がある頃。" },
  { month: 2, fromDay: 14, toDay: 28, title: "梅の便りと余寒", detail: "梅がほころび始め、バレンタイン明けでお菓子の話題が話しやすい時期。" },
  { month: 3, fromDay: 1, toDay: 15, title: "ひな祭り・春先", detail: "桃の節句や春の支度。淡い色の菓子や桜への期待が話題に乗りやすい。" },
  { month: 3, fromDay: 16, toDay: 31, title: "彼岸・桜の頃", detail: "春分・お彼岸を抜けて桜のつぼみが膨らむ頃。陽射しがあたたかい話題が合う。" },
  { month: 4, title: "新年度・桜", detail: "新生活の落ち着かない空気と、桜・新茶の便り。淹れたての紅茶が映える季節。" },
  { month: 5, title: "若葉・初夏の入口", detail: "ゴールデンウィーク明けの新緑とアイスティーが似合う頃。" },
  { month: 6, title: "梅雨", detail: "雨音と湿度。窓辺で本を読みながらの紅茶や、湿気対策の小話が話題になる。" },
  { month: 7, title: "夏本番の入口", detail: "蝉の声、冷たい飲み物、夕立。氷出しの紅茶が映える季節。" },
  { month: 7, fromDay: 1, toDay: 7, title: "七夕の頃", detail: "短冊と笹。星空や願い事の話が自然に乗る。" },
  { month: 8, title: "真夏・お盆", detail: "暑さのピークと夏休みの空気。冷房と冷茶、夕涼みの話題が合う。" },
  { month: 9, title: "残暑から秋の入口", detail: "朝晩の気温差。お月見、栗、新米など実りの話題が出始める。" },
  { month: 10, title: "金木犀・読書の秋", detail: "肌寒さと香り。温かい紅茶と読書、ハロウィン前の小さなお菓子の話題が乗る。" },
  { month: 11, title: "晩秋・紅葉", detail: "落ち葉と冷え込み。スパイス系のお菓子やチャイの話題が合う。" },
  { month: 12, title: "冬至・年の瀬", detail: "クリスマス〜年の瀬の少し慌ただしい空気。温かい紅茶やゆず湯の話題が出やすい。" },
]

export function fetchSeasonContextSnippet(now: Date = new Date()): Promise<AutopilotDiscoverySnippet> {
  return getCached(`season:${formatDateKey(now)}`, CACHE_TTL_MS, async () => buildSeasonContextSnippet(now))
}

export function buildSeasonContextSnippet(now: Date = new Date()): AutopilotDiscoverySnippet {
  const month = now.getMonth() + 1
  const day = now.getDate()

  const candidates = SEASONAL_TABLE.filter((entry) => {
    if (entry.month !== month) return false
    if (entry.fromDay !== undefined && day < entry.fromDay) return false
    if (entry.toDay !== undefined && day > entry.toDay) return false
    return true
  })

  const pick = pickMostSpecific(candidates) ?? {
    month,
    title: "今の季節",
    detail: "暦に縛られず、今日の気温や空気感を素直に拾える時期。",
  }

  return {
    source: "season",
    title: pick.title,
    detail: pick.detail,
  }
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function pickMostSpecific(entries: SeasonalEntry[]): SeasonalEntry | null {
  if (entries.length === 0) return null
  // Prefer narrowest window (smallest day range) when multiple match.
  return entries
    .slice()
    .sort((a, b) => windowSize(a) - windowSize(b))[0] ?? null
}

function windowSize(entry: SeasonalEntry): number {
  const from = entry.fromDay ?? 1
  const to = entry.toDay ?? 31
  return Math.max(1, to - from + 1)
}
