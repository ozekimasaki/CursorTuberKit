export type Emotion = "neutral" | "joy" | "anger" | "sadness" | "delight"

const emotionRules: Array<{ emotion: Exclude<Emotion, "neutral">; weight: number; tokens: readonly string[] }> = [
  {
    emotion: "joy",
    weight: 1.8,
    tokens: [
      "うれしい",
      "嬉しい",
      "よかった",
      "ありがとう",
      "素敵",
      "すてき",
      "最高",
      "幸せ",
      "やった",
      "大好き",
      "好きです",
      "にこにこ",
    ],
  },
  {
    emotion: "anger",
    weight: 2,
    tokens: [
      "だめ",
      "ダメ",
      "許せ",
      "許しません",
      "ぷん",
      "むっ",
      "怒",
      "いやです",
      "嫌です",
      "やめて",
      "最悪",
      "困ります",
      "違います",
    ],
  },
  {
    emotion: "sadness",
    weight: 2,
    tokens: [
      "悲しい",
      "かなしい",
      "寂しい",
      "さみしい",
      "しょんぼり",
      "つらい",
      "辛い",
      "ごめん",
      "ごめんなさい",
      "残念",
      "切ない",
      "泣",
      "しくしく",
    ],
  },
  {
    emotion: "delight",
    weight: 1.8,
    tokens: [
      "楽しい",
      "たのしい",
      "わくわく",
      "ワクワク",
      "うきうき",
      "きゃっ",
      "きゃー",
      "ふふ",
      "えへ",
      "るんるん",
      "待ちきれ",
      "胸が躍",
      "はしゃ",
    ],
  },
]

const tieBreakerOrder: Emotion[] = ["anger", "sadness", "delight", "joy", "neutral"]

export function inferEmotionFromText(text: string): Emotion {
  const normalized = normalizeEmotionText(text)

  if (!normalized) {
    return "neutral"
  }

  const scores: Record<Exclude<Emotion, "neutral">, number> = {
    joy: 0,
    anger: 0,
    sadness: 0,
    delight: 0,
  }

  for (const rule of emotionRules) {
    for (const token of rule.tokens) {
      if (normalized.includes(token.toLowerCase())) {
        scores[rule.emotion] += rule.weight
      }
    }
  }

  const exclamationCount = countMatches(normalized, /[!！]/g)
  const ellipsisCount = countMatches(normalized, /…|\.{2,}/g)
  const questionCount = countMatches(normalized, /[?？]/g)
  const heartCount = countMatches(normalized, /[♡♥❤]/g)
  const laughterCount = countMatches(normalized, /w{2,}|笑/g)

  if (heartCount > 0) {
    scores.joy += heartCount * 1.3
    scores.delight += heartCount * 0.8
  }

  if (laughterCount > 0) {
    scores.delight += laughterCount * 1.2
    scores.joy += laughterCount * 0.5
  }

  if (ellipsisCount > 0) {
    scores.sadness += ellipsisCount * 0.8
  }

  if (questionCount > 1) {
    scores.delight += questionCount * 0.35
  }

  if (exclamationCount > 0) {
    if (scores.anger >= 1.5) {
      scores.anger += exclamationCount * 0.7
    } else {
      scores.delight += exclamationCount * 0.75
      scores.joy += exclamationCount * 0.3
    }
  }

  if (normalized.includes("！") && normalized.includes("だめ")) {
    scores.anger += 1.2
  }

  if (normalized.includes("…") && scores.sadness === 0) {
    scores.sadness += 0.4
  }

  const ranked = Object.entries(scores)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1]
      }

      return tieBreakerOrder.indexOf(left[0] as Emotion) - tieBreakerOrder.indexOf(right[0] as Emotion)
    })

  const [topEmotion, topScore] = ranked[0] ?? ["neutral", 0]
  const [, secondScore] = ranked[1] ?? ["neutral", 0]

  if (topScore < 1.1 || topScore - secondScore < 0.35) {
    return "neutral"
  }

  return topEmotion as Emotion
}

function normalizeEmotionText(text: string) {
  return text.replace(/\s+/g, "").trim().toLowerCase()
}

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0
}
