import type { AutopilotDiscoverySnippet } from "../../shared/autopilot.js"

export function buildTimeContextSnippet(now: Date = new Date()): AutopilotDiscoverySnippet {
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  })

  const detail = formatter.format(now)
  const season = inferJapaneseSeason(now)
  const timeBand = inferTimeBand(now)

  return {
    source: "time",
    title: "現在時刻",
    detail: `${detail} (${season} / ${timeBand})`,
  }
}

function inferJapaneseSeason(now: Date): string {
  const month = Number(
    new Intl.DateTimeFormat("ja-JP", { month: "numeric", timeZone: "Asia/Tokyo" })
      .format(now)
      .replace(/\D/g, ""),
  )

  if (month >= 3 && month <= 5) return "春"
  if (month >= 6 && month <= 8) return "夏"
  if (month >= 9 && month <= 11) return "秋"
  return "冬"
}

function inferTimeBand(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", hour12: false, timeZone: "Asia/Tokyo" })
      .format(now)
      .replace(/\D/g, ""),
  )

  if (hour < 5) return "深夜"
  if (hour < 10) return "朝"
  if (hour < 14) return "昼"
  if (hour < 18) return "午後"
  if (hour < 22) return "夜"
  return "夜更け"
}
