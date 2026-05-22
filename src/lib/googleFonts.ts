import { useEffect } from "react"

export type CaptionFontOption = {
  id: string
  label: string
  family: string
  googleFamily?: string
  weights?: number[]
  stack: string
}

const SYSTEM_JP_STACK =
  '"Hiragino Maru Gothic ProN", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", system-ui, -apple-system, sans-serif'

export const captionFontOptions: CaptionFontOption[] = [
  {
    id: "system",
    label: "システム標準",
    family: "system",
    stack: SYSTEM_JP_STACK,
  },
  {
    id: "kiwi-maru",
    label: "Kiwi Maru（やわらか丸ゴシック）",
    family: "Kiwi Maru",
    googleFamily: "Kiwi+Maru:wght@300;400;500",
    weights: [300, 400, 500],
    stack: `"Kiwi Maru", ${SYSTEM_JP_STACK}`,
  },
  {
    id: "zen-maru-gothic",
    label: "Zen Maru Gothic（モダン丸ゴ）",
    family: "Zen Maru Gothic",
    googleFamily: "Zen+Maru+Gothic:wght@400;500;700;900",
    weights: [400, 500, 700, 900],
    stack: `"Zen Maru Gothic", ${SYSTEM_JP_STACK}`,
  },
  {
    id: "mplus-rounded-1c",
    label: "M PLUS Rounded 1c（読みやすい丸ゴ）",
    family: "M PLUS Rounded 1c",
    googleFamily: "M+PLUS+Rounded+1c:wght@400;500;700;800;900",
    weights: [400, 500, 700, 800, 900],
    stack: `"M PLUS Rounded 1c", ${SYSTEM_JP_STACK}`,
  },
  {
    id: "yusei-magic",
    label: "Yusei Magic（手書き風）",
    family: "Yusei Magic",
    googleFamily: "Yusei+Magic",
    weights: [400],
    stack: `"Yusei Magic", ${SYSTEM_JP_STACK}`,
  },
  {
    id: "klee-one",
    label: "Klee One（教科書風手書き）",
    family: "Klee One",
    googleFamily: "Klee+One:wght@400;600",
    weights: [400, 600],
    stack: `"Klee One", ${SYSTEM_JP_STACK}`,
  },
  {
    id: "hachi-maru-pop",
    label: "Hachi Maru Pop（ポップ）",
    family: "Hachi Maru Pop",
    googleFamily: "Hachi+Maru+Pop",
    weights: [400],
    stack: `"Hachi Maru Pop", ${SYSTEM_JP_STACK}`,
  },
  {
    id: "mochiy-pop-one",
    label: "Mochiy Pop One（もちもち）",
    family: "Mochiy Pop One",
    googleFamily: "Mochiy+Pop+One",
    weights: [400],
    stack: `"Mochiy Pop One", ${SYSTEM_JP_STACK}`,
  },
  {
    id: "yomogi",
    label: "Yomogi（手書き）",
    family: "Yomogi",
    googleFamily: "Yomogi",
    weights: [400],
    stack: `"Yomogi", ${SYSTEM_JP_STACK}`,
  },
  {
    id: "dotgothic16",
    label: "DotGothic16（ドット）",
    family: "DotGothic16",
    googleFamily: "DotGothic16",
    weights: [400],
    stack: `"DotGothic16", ${SYSTEM_JP_STACK}`,
  },
  {
    id: "shippori-mincho",
    label: "Shippori Mincho B1（明朝）",
    family: "Shippori Mincho B1",
    googleFamily: "Shippori+Mincho+B1:wght@400;600;700;800",
    weights: [400, 600, 700, 800],
    stack: `"Shippori Mincho B1", ${SYSTEM_JP_STACK}`,
  },
  {
    id: "noto-sans-jp",
    label: "Noto Sans JP（標準サンセリフ）",
    family: "Noto Sans JP",
    googleFamily: "Noto+Sans+JP:wght@400;500;700;900",
    weights: [400, 500, 700, 900],
    stack: `"Noto Sans JP", ${SYSTEM_JP_STACK}`,
  },
]

export function findCaptionFontOption(id: string | undefined | null): CaptionFontOption {
  return captionFontOptions.find((opt) => opt.id === id) ?? captionFontOptions[0]
}

const LINK_ID_PREFIX = "ctk-google-font-"

function ensureGoogleFontLink(option: CaptionFontOption): HTMLLinkElement | null {
  if (typeof document === "undefined") return null
  if (!option.googleFamily) return null
  const id = `${LINK_ID_PREFIX}${option.id}`
  let link = document.getElementById(id) as HTMLLinkElement | null
  if (link) return link
  link = document.createElement("link")
  link.id = id
  link.rel = "stylesheet"
  link.href = `https://fonts.googleapis.com/css2?family=${option.googleFamily}&display=swap`
  document.head.appendChild(link)
  return link
}

export function loadCaptionFont(option: CaptionFontOption): void {
  ensureGoogleFontLink(option)
}

export function useCaptionFont(fontId: string): CaptionFontOption {
  const option = findCaptionFontOption(fontId)
  useEffect(() => {
    loadCaptionFont(option)
  }, [option])
  return option
}
