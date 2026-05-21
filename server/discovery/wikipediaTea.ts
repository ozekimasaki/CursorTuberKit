import type { AutopilotDiscoverySnippet } from "../../shared/autopilot.js"
import { getCached } from "./cache.js"

const WIKIPEDIA_TEA_CATEGORIES = ["紅茶", "茶", "茶器", "ティーサロン"] as const
const WIKIPEDIA_API = "https://ja.wikipedia.org/w/api.php"
const CACHE_TTL_MS = 60_000
const FETCH_TIMEOUT_MS = 3500

const FALLBACK_TEA_SNIPPETS: Array<{ title: string; detail: string }> = [
  { title: "アッサム", detail: "インド北東部のアッサム地方で採れる、コクとモルティな香りが特徴の紅茶。" },
  { title: "ダージリン", detail: "ヒマラヤ山麓ダージリン産。マスカテルフレーバーと呼ばれる華やかな香りで知られる。" },
  { title: "アールグレイ", detail: "ベルガモットで香り付けされた紅茶のブレンドで、柑橘の爽やかさが特徴。" },
  { title: "ラプサンスーチョン", detail: "中国福建省の燻香紅茶。松葉で燻したスモーキーな香りを持つ。" },
  { title: "シルバーニードル", detail: "中国福建省の白茶。新芽の銀色の産毛が美しく、繊細な甘さがある。" },
  { title: "ロイヤルミルクティー", detail: "茶葉を煮出してから牛乳と合わせる、濃厚なミルクティーのスタイル。" },
  { title: "アフタヌーンティー", detail: "19世紀イギリス貴族の習慣から広がった、午後の軽食と紅茶の時間。" },
  { title: "キャンディ", detail: "スリランカ中部の高地で採れるセイロン紅茶のひとつ。クセが少なくバランスがよい。" },
]

export async function fetchWikipediaTeaSnippet(): Promise<AutopilotDiscoverySnippet> {
  const category = WIKIPEDIA_TEA_CATEGORIES[Math.floor(Math.random() * WIKIPEDIA_TEA_CATEGORIES.length)]
  return getCached(`wikipedia-tea:${category}`, CACHE_TTL_MS, async () => {
    try {
      return await loadRandomTeaArticle(category)
    } catch (error) {
      const fallback = pickFallbackSnippet()
      console.warn(
        `Wikipedia tea snippet fetch failed, using fallback: ${error instanceof Error ? error.message : String(error)}`,
      )
      return fallback
    }
  })
}

async function loadRandomTeaArticle(category: string): Promise<AutopilotDiscoverySnippet> {
  const titles = await fetchCategoryMembers(category)

  if (titles.length === 0) {
    throw new Error(`No category members found for ${category}`)
  }

  const pageTitle = titles[Math.floor(Math.random() * titles.length)]
  const summary = await fetchPageExtract(pageTitle)

  return {
    source: "wikipedia-tea",
    title: pageTitle,
    detail: summary,
  }
}

async function fetchCategoryMembers(category: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: "query",
    list: "categorymembers",
    cmtitle: `Category:${category}`,
    cmlimit: "50",
    cmtype: "page",
    format: "json",
    origin: "*",
  })

  const data = await fetchJson(`${WIKIPEDIA_API}?${params.toString()}`)
  const members = data?.query?.categorymembers

  if (!Array.isArray(members)) {
    return []
  }

  return members
    .map<string | null>((m) =>
      m && typeof m === "object" && typeof (m as { title?: unknown }).title === "string"
        ? (m as { title: string }).title
        : null,
    )
    .filter(
      (title): title is string =>
        title !== null && !title.startsWith("Category:") && !title.startsWith("Template:"),
    )
}

async function fetchPageExtract(title: string): Promise<string> {
  const params = new URLSearchParams({
    action: "query",
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    titles: title,
    format: "json",
    origin: "*",
  })

  const data = await fetchJson(`${WIKIPEDIA_API}?${params.toString()}`)
  const pages = data?.query?.pages

  if (pages && typeof pages === "object") {
    for (const page of Object.values(pages as Record<string, unknown>)) {
      if (page && typeof page === "object") {
        const extract = (page as { extract?: unknown }).extract
        if (typeof extract === "string" && extract.trim()) {
          return truncate(extract.replace(/\s+/g, " ").trim(), 220)
        }
      }
    }
  }

  return `${title} に関する短いメモ。`
}

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "CursorTuberKit/0.1 (autopilot discovery)" },
    })

    if (!response.ok) {
      throw new Error(`Wikipedia API ${response.status}`)
    }

    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

function pickFallbackSnippet(): AutopilotDiscoverySnippet {
  const pick = FALLBACK_TEA_SNIPPETS[Math.floor(Math.random() * FALLBACK_TEA_SNIPPETS.length)]
  return {
    source: "wikipedia-tea",
    title: pick.title,
    detail: pick.detail,
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
