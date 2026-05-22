import type { ChatMetadataPayload, ChatSessionPayload } from "../../shared/chatStream"
import type { FinalEmotionPayload } from "../../shared/emotion"
import type { PlatformViewerEvent } from "../../shared/platformChat"
import type { ChatRunRecap } from "./runtimeStatus"

type ConversationTurnLike = {
  role: "assistant" | "user"
  text: string
}

export type ContentTone = "active" | "error" | "muted" | "ok" | "warn"

export type CharacterContentSuggestion = {
  id: "opening" | "mini-corner" | "recap" | "teaser" | "chapter-break"
  prompt: string
  summary: string
  title: string
  tone: ContentTone
}

export type CharacterContentSurface = {
  callbackHint: string
  capabilityBadges: string[]
  providerSummary: string
  relationHint: string
  suggestions: CharacterContentSuggestion[]
  tone: {
    detail: string
    label: string
    tone: ContentTone
  }
}

type DeriveCharacterContentSurfaceInput = {
  finalEmotion: FinalEmotionPayload | null
  latestRunRecap: ChatRunRecap | null
  providerMetadata: ChatMetadataPayload | null
  recentTurns: ConversationTurnLike[]
  responseText: string
  sessionMetadata: ChatSessionPayload | null
  liveViewerEvents: PlatformViewerEvent[]
}

export function deriveCharacterContentSurface(
  input: DeriveCharacterContentSurfaceInput,
): CharacterContentSurface {
  const {
    finalEmotion,
    latestRunRecap,
    liveViewerEvents,
    providerMetadata,
    recentTurns,
    responseText,
    sessionMetadata,
  } = input
  const latestViewerEvent = liveViewerEvents[0] ?? null
  const latestTurn = recentTurns.length > 0 ? recentTurns[recentTurns.length - 1] : null
  const topicSeed =
    firstMeaningfulText(latestViewerEvent?.text) ??
    firstMeaningfulText(responseText) ??
    firstMeaningfulText(latestTurn?.text) ??
    latestRunRecap?.responsePreview ??
    "今の配信の空気"
  const topicLabel = topicSeed.length > 28 ? `${topicSeed.slice(0, 27)}…` : topicSeed
  const autonomousContext = buildAutonomousContextHint(finalEmotion, latestRunRecap, recentTurns, latestViewerEvent)
  const providerSummary = buildProviderSummary(providerMetadata, sessionMetadata)

  return {
    callbackHint: buildCallbackHint(recentTurns, latestRunRecap, providerMetadata),
    capabilityBadges: buildCapabilityBadges(providerMetadata, sessionMetadata, latestViewerEvent),
    providerSummary,
    relationHint: buildRelationHint(recentTurns, sessionMetadata, latestViewerEvent),
    suggestions: [
      {
        id: "opening",
        prompt:
          `今のキャラ設定と継続文脈を保ったまま、配信のオープニングを2〜3文でお願いします。空気: ${autonomousContext}。最初の挨拶と今夜の雰囲気を、自分の言葉で自然に話し始めてください。【重要】視聴者コメントの量(少ない/無い/ROM等)に言及しない。「コメント待ってる」「コメントしてね」のような呼びかけや催促もしない。視聴者状況へのメタ発言を一切避け、自分の興味や所感だけで話を立ち上げてください。`,
        summary: "第一声を自然に整えます。",
        title: "Opening",
        tone: "ok",
      },
      {
        id: "mini-corner",
        prompt: `空気メモ: ${autonomousContext}。「${topicLabel}」を入口にして、30秒くらいのミニコーナーを自分の言葉で始めてください。【重要】視聴者コメントの量や有無に触れない。「コメント来ないけど」「コメントが少ないので」等のメタ発言は禁止。自分の体験や好み、観察を起点にして話を進めてください。`,
        summary: `「${topicLabel}」から小さな企画へ広げます。`,
        title: "Mini corner",
        tone: "active",
      },
      {
        id: "recap",
        prompt: `空気メモ: ${autonomousContext}。直前までの自分の発言を1〜2点拾って、配信者本人として2〜3文で recap し、そこから自然に次の一言へつなげてください。【重要】「コメント少ないけど」のような視聴者状況へのメタ発言はしない。自分の話の流れだけで完結させてください。`,
        summary:
          latestRunRecap?.responsePreview && latestRunRecap.responsePreview.trim()
            ? `直近の返答「${truncateText(latestRunRecap.responsePreview, 42)}」を踏まえて振り返ります。`
            : "直近の自分の発言を踏まえて自然につなげます。",
        title: "Recap",
        tone: "warn",
      },
      {
        id: "teaser",
        prompt: `空気メモ: ${autonomousContext}。次に広げると楽しい話題を teaser っぽく2文で出してください。いまの配信トーンを保ちつつ、続きを聞きたくなる一言で締めてください。【重要】視聴者コメントの量・有無に言及しない。「コメント無いから」「ROM専さん」等のメタ発言を絶対に入れず、自分の興味として自然に振る舞ってください。`,
        summary: "次の話題や小ネタへのつなぎを作ります。",
        title: "Teaser",
        tone: "muted",
      },
      {
        id: "chapter-break",
        prompt: `空気メモ: ${autonomousContext}。ここで一度、配信の流れに小さな区切りを入れてください。直前の話題を1点だけ短く受けてから、「ちょっとひと息」「ここから少し別の角度」など雰囲気を切り替える一言を挟み、次のコーナーや別テーマへ自然にスライドしてください。2〜3文で、押し付けがましくならないトーンで。【重要】視聴者コメントの量・有無、AI/プロンプト/自走モード等のメタ表現は一切禁止。直近の自分の発話に必ず1度は触れてから切り替えること。`,
        summary: "コーナーや空気を切り替える区切りを入れます。",
        title: "Chapter break",
        tone: "warn",
      },
    ],
    tone: buildToneSurface(finalEmotion, providerMetadata),
  }
}

function buildToneSurface(
  finalEmotion: FinalEmotionPayload | null,
  providerMetadata: ChatMetadataPayload | null,
): CharacterContentSurface["tone"] {
  if (!finalEmotion) {
    return {
      detail: providerMetadata?.supportsProviderEmotion
        ? "Cursor の final emotion と stop hook 経路でトーンを確定できます。"
        : "final emotion 到着前は本文から暫定トーンを表示します。",
      label: providerMetadata?.supportsProviderEmotion ? "最終トーン待ち" : "本文ベースのトーン",
      tone: providerMetadata?.supportsProviderEmotion ? "warn" : "muted",
    }
  }

  const emotionLabel = formatEmotionLabel(finalEmotion.emotion)
  const sourceLabel = finalEmotion.source === "cursor-subagent" ? "Cursor subagent" : "本文推定"

  return {
    detail: `${sourceLabel}${finalEmotion.hookObserved ? " / stop hook 済み" : ""}`,
    label: `${emotionLabel}トーン`,
    tone: toneFromEmotion(finalEmotion.emotion),
  }
}

function buildProviderSummary(
  providerMetadata: ChatMetadataPayload | null,
  sessionMetadata: ChatSessionPayload | null,
) {
  if (!providerMetadata) {
    return "接続後にモデル情報と継続セッション可否を表示します。"
  }

  const parts = [`${providerMetadata.provider} · ${providerMetadata.model}`]

  if (providerMetadata.emotionModel) {
    parts.push(`emotion ${providerMetadata.emotionModel}`)
  }

  if (sessionMetadata?.supportsResume) {
    parts.push(sessionMetadata.resumedAgent ? "resume 中" : "session keep")
  } else if (providerMetadata.supportsProviderSessionReuse) {
    parts.push("session reuse")
  }

  return parts.join(" / ")
}

function buildCapabilityBadges(
  providerMetadata: ChatMetadataPayload | null,
  sessionMetadata: ChatSessionPayload | null,
  latestViewerEvent: PlatformViewerEvent | null,
) {
  const badges = ["コメント返し", "オープニング", "ミニ企画", "振り返り", "次回振り"]

  if (providerMetadata?.supportsProviderEmotion) {
    badges.unshift("最終感情")
  }

  if (sessionMetadata?.supportsResume || providerMetadata?.supportsProviderSessionReuse) {
    badges.unshift("継続セッション")
  }

  if (latestViewerEvent?.isMonetized) {
    badges.unshift("課金コメント優先")
  }

  return badges.slice(0, 7)
}

function buildCallbackHint(
  recentTurns: ConversationTurnLike[],
  latestRunRecap: ChatRunRecap | null,
  providerMetadata: ChatMetadataPayload | null,
) {
  const latestUserTurn = [...recentTurns].reverse().find((turn) => turn.role === "user")
  const latestAssistantTurn = [...recentTurns].reverse().find((turn) => turn.role === "assistant")

  if (latestUserTurn && latestAssistantTurn) {
    return `直近は「${truncateText(latestUserTurn.text, 24)}」に「${truncateText(latestAssistantTurn.text, 28)}」で返しています。続きを拾いやすいです。`
  }

  if (latestRunRecap?.recentTurnsCount) {
    return `ブラウザ内の直近 ${latestRunRecap.recentTurnsCount} ターンぶんの流れを recap や callback に再利用できます。`
  }

  if (providerMetadata?.supportsProviderSessionReuse) {
    return "継続セッション前提で、前フリや呼びかけを次の返答へつなげられます。"
  }

  return "最初の一声からでも、短い合図を置いて次の話題へつなぐ構成が作れます。"
}

function buildRelationHint(
  recentTurns: ConversationTurnLike[],
  sessionMetadata: ChatSessionPayload | null,
  latestViewerEvent: PlatformViewerEvent | null,
) {
  if (latestViewerEvent) {
    return latestViewerEvent.isMonetized
      ? `${latestViewerEvent.authorName}さんにはお礼を厚めにしつつ、配信全体にも返せる距離感で話せます。`
      : `${latestViewerEvent.authorName}さんのコメントを起点に、常連にも初見にも届く返し方へ広げられます。`
  }

  if (recentTurns.length > 0 && sessionMetadata?.supportsResume) {
    return "直近の呼びかけ方や甘さ加減を保ったまま、関係性の温度を少しずつ積み上げられます。"
  }

  return "初見にはやわらかく、常連には少し近めに。配信者本人らしい距離感を調整できます。"
}

function buildAutonomousContextHint(
  finalEmotion: FinalEmotionPayload | null,
  latestRunRecap: ChatRunRecap | null,
  recentTurns: ConversationTurnLike[],
  latestViewerEvent: PlatformViewerEvent | null,
) {
  const latestAssistantTurn = [...recentTurns].reverse().find((turn) => turn.role === "assistant")

  if (latestViewerEvent) {
    return `${latestViewerEvent.authorName}さんの反応を拾った直後の空気`
  }

  if (latestRunRecap?.responsePreview) {
    return `直近は「${truncateText(latestRunRecap.responsePreview, 36)}」という流れ`
  }

  if (latestAssistantTurn?.text) {
    return `直近の発話は「${truncateText(latestAssistantTurn.text, 36)}」`
  }

  if (finalEmotion) {
    return `${formatEmotionLabel(finalEmotion.emotion)}寄りの配信トーン`
  }

  return "落ち着いた配信トーンで、自分の関心から自然に話を広げたい時間帯"
}

function toneFromEmotion(emotion: FinalEmotionPayload["emotion"]): ContentTone {
  switch (emotion) {
    case "joy":
      return "ok"
    case "delight":
      return "active"
    case "anger":
    case "sadness":
      return "warn"
    case "neutral":
      return "muted"
  }
}

function formatEmotionLabel(emotion: FinalEmotionPayload["emotion"]) {
  switch (emotion) {
    case "neutral":
      return "ニュートラル"
    case "joy":
      return "やさしめ"
    case "anger":
      return "ツッコミ"
    case "sadness":
      return "しっとり"
    case "delight":
      return "はしゃぎ気味"
  }
}

function firstMeaningfulText(value: string | undefined) {
  if (!value) {
    return null
  }

  const normalized = value.replace(/\s+/g, " ").trim()

  if (!normalized) {
    return null
  }

  return normalized.split(/[。！？!?]/)[0]?.trim() || normalized
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized
}
