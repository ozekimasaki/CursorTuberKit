import type { PlatformViewerEvent } from "../../shared/platformChat"
import { MAX_QUEUED_VIEWER_EVENTS } from "./autoReplyConstants"

export type ViewerEventTriageDecision = {
  action: "queue" | "skip"
  reason: string
  score: number
}

export function insertViewerEvent(current: PlatformViewerEvent[], next: PlatformViewerEvent) {
  return [next, ...current.filter((event) => event.id !== next.id)].slice(0, MAX_QUEUED_VIEWER_EVENTS)
}

export function describeEventKind(event: PlatformViewerEvent) {
  switch (event.kind) {
    case "comment":
      return "通常コメント"
    case "superchat":
      return "スーパーチャット"
    case "paid_sticker":
      return "有料スタンプ"
    case "membership":
      return "メンバー加入"
    case "subscription":
      return "サブスク"
    case "gift_subscription":
      return "ギフトサブスク"
    case "cheer":
      return "Cheer"
    case "hype_chat":
      return "Hype Chat"
  }
}

export function assessViewerEventTriage(event: PlatformViewerEvent): ViewerEventTriageDecision {
  if (event.moderation.disposition === "block") {
    return {
      action: "skip",
      reason: "moderation により block 判定でした。",
      score: -99,
    }
  }

  if (event.isMonetized || event.kind !== "comment") {
    return {
      action: "queue",
      reason: "課金・特別イベントなので優先して返します。",
      score: 10,
    }
  }

  const normalized = normalizeViewerEventText(event.text)

  if (!normalized) {
    return {
      action: "skip",
      reason: "内容が薄く、返答軸を作りにくい短文です。",
      score: -5,
    }
  }

  let score = 0
  const reasons: string[] = []

  if (looksLikeAckComment(normalized)) {
    score -= 1
    reasons.push("相槌・リアクション寄り")
  }

  if (looksLikeLaughterOnly(normalized)) {
    score -= 1
    reasons.push("笑い・スタンプ寄り")
  }

  if (containsQuestionCue(normalized)) {
    score += 3
    reasons.push("質問系")
  }

  if (containsReplyWorthyCue(normalized)) {
    score += 2
    reasons.push("話題を広げやすい")
  }

  if (containsSupportiveSpecificity(normalized)) {
    score += 1
    reasons.push("感想に具体性あり")
  }

  if (normalized.length >= 20) {
    score += 1
    reasons.push("情報量あり")
  }

  if (event.moderation.disposition === "review") {
    score -= 1
    reasons.push("review 判定")
  }

  return score >= 2
    ? {
        action: "queue",
        reason: reasons.join(" / "),
        score,
      }
    : {
        action: "queue",
        reason: reasons[0] ?? "優先度は低めですが、候補として保持します。",
        score,
      }
}

export function insertQueuedViewerEvent(queue: PlatformViewerEvent[], event: PlatformViewerEvent) {
  return [...queue.filter((item) => item.id !== event.id), event]
    .sort(compareQueuedViewerEvents)
    .slice(0, MAX_QUEUED_VIEWER_EVENTS)
}

export function compareQueuedViewerEvents(a: PlatformViewerEvent, b: PlatformViewerEvent) {
  // Tier 1: 課金イベント（スパチャ等）を必ず最優先で返す。
  if (a.isMonetized !== b.isMonetized) {
    return a.isMonetized ? -1 : 1
  }

  // Tier 2: triage スコアが高いものを優先（コメントの返信価値）。
  const scoreDelta = assessViewerEventTriage(b).score - assessViewerEventTriage(a).score

  if (scoreDelta !== 0) {
    return scoreDelta
  }

  // Tier 3: 同優先度なら受信時刻の古い順（FIFO）。
  return Date.parse(a.receivedAt) - Date.parse(b.receivedAt)
}

export function normalizeViewerEventText(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
}

export function looksLikeAckComment(text: string) {
  return /^(うん|はい|ほい|おk|ok|なるほど|たしかに|せやな|そうだね|そう|ほんと|ほんま|いいね|いいかも|わかる|えらい|すごい|かわいい|助かる|ありがとう|草)$/.test(
    text,
  )
}

export function looksLikeLaughterOnly(text: string) {
  return /^[wｗ笑草👏🙏✨⭐️⭐🤣😂😹😺!?！？…]+$/.test(text)
}

export function containsQuestionCue(text: string) {
  return /[?？]|(なに|何|どう|なんで|なぜ|どれ|どっち|教えて|聞きたい|おすすめ|好き)/.test(text)
}

export function containsReplyWorthyCue(text: string) {
  return /(やって|見たい|してほしい|話して|相談|気になる|初見|こんばんは|おはよう|ただいま|いまきた|配信)/.test(
    text,
  )
}

export function containsSupportiveSpecificity(text: string) {
  return /(声|衣装|表情|話し方|トーク|今日|さっき|今の|その話|その流れ|雰囲気)/.test(text)
}
