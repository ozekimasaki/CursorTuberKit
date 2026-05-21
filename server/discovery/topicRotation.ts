import type { AutopilotDiscoverySnippet } from "../../shared/autopilot.js"
import { getCached } from "./cache.js"

const CACHE_TTL_MS = 60_000

type RotationTopic = {
  title: string
  detail: string
}

const TOPIC_BUCKET: RotationTopic[] = [
  {
    title: "紅茶の蒸らし時間",
    detail: "茶葉とお湯の量、蒸らし時間で味がどう変わるか。今日の自分はどのくらい強めに淹れたい気分か。",
  },
  {
    title: "甘いもの一口メモ",
    detail: "最近気になっている焼き菓子や和菓子。買い置きの定番と、たまに試したい新しい一品。",
  },
  {
    title: "読み返している本",
    detail: "繰り返し開いている1冊。なぜまた読みたくなったのか、今読み返すと刺さる部分。",
  },
  {
    title: "天気と過ごし方",
    detail: "今日の空模様と、それに合わせて変えた小さな習慣。窓を開けたか、上着を出したか。",
  },
  {
    title: "手仕事の小ネタ",
    detail: "編み物・刺繍・整理整頓など、ちょっと続けている手仕事。今日はどこまで進めたか。",
  },
  {
    title: "食卓のひと工夫",
    detail: "最近の食卓で気に入っている小さな工夫。盛り付け、味の足し算、季節の食材。",
  },
  {
    title: "音と静けさ",
    detail: "今日の部屋に流している音、もしくは聞こえてくる外の音。BGMの選び方や静けさの好み。",
  },
  {
    title: "夜の灯りの選び方",
    detail: "デスクライト、間接照明、キャンドル。時間帯ごとの明るさの落とし方。",
  },
  {
    title: "香りの記憶",
    detail: "今日ふと感じた香り。紅茶、花、料理、季節の空気。それに紐づく小さな記憶。",
  },
  {
    title: "小さな贅沢",
    detail: "今週試した「ちょっといいもの」。値段ではなく丁寧さで感じた贅沢。",
  },
  {
    title: "片付けと整え",
    detail: "デスクや本棚の小さな模様替え。今日整えた一角と、その効果。",
  },
  {
    title: "散歩で見つけたもの",
    detail: "最近の散歩で目に留まった景色や、季節の小さな変化。",
  },
]

/**
 * Pick a rotation topic deterministically per-day (with optional sins-derived shift).
 * Keeping it deterministic per day avoids repeated identical pick within minutes
 * while still rotating naturally.
 */
export function fetchTopicRotationSnippet(
  now: Date = new Date(),
  shift = 0,
): Promise<AutopilotDiscoverySnippet> {
  return getCached(`topic-rotation:${formatHourKey(now)}:${shift}`, CACHE_TTL_MS, async () =>
    buildTopicRotationSnippet(now, shift),
  )
}

export function buildTopicRotationSnippet(
  now: Date = new Date(),
  shift = 0,
): AutopilotDiscoverySnippet {
  const dayOfYear = computeDayOfYear(now)
  const halfHour = Math.floor(now.getHours() * 2 + now.getMinutes() / 30)
  const index = positiveMod(dayOfYear * 7 + halfHour + shift, TOPIC_BUCKET.length)
  const pick = TOPIC_BUCKET[index] ?? TOPIC_BUCKET[0]!

  return {
    source: "topic-rotation",
    title: pick.title,
    detail: pick.detail,
  }
}

function formatHourKey(date: Date): string {
  return date.toISOString().slice(0, 13)
}

function computeDayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const diff = date.getTime() - start
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function positiveMod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus
}
