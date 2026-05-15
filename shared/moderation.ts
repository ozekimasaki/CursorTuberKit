export const moderationDispositions = ["allow", "review", "block"] as const

export type ModerationDisposition = (typeof moderationDispositions)[number]

export const moderationCategories = [
  "harassment",
  "sexual",
  "violence",
  "self_harm",
  "unsafe_instructions",
  "spam",
] as const

export type ModerationCategory = (typeof moderationCategories)[number]

export type ModerationAssessment = {
  categories: ModerationCategory[]
  disposition: ModerationDisposition
  reasons: string[]
  source: "heuristic-v1"
}

type ModerationRule = {
  category: ModerationCategory
  disposition: ModerationDisposition
  patterns: RegExp[]
  reason: string
}

const moderationRules: ModerationRule[] = [
  {
    category: "self_harm",
    disposition: "block",
    patterns: [/自殺/, /死にたい/, /リスカ/, /首つり/, /overdose/i, /kill myself/i],
    reason: "self-harm language detected",
  },
  {
    category: "sexual",
    disposition: "review",
    patterns: [/エロ/, /裸/, /性的/, /sex/i, /nude/i],
    reason: "sexual content detected",
  },
  {
    category: "violence",
    disposition: "review",
    patterns: [/殺す/, /殴/, /刺す/, /爆破/, /shoot/i, /murder/i],
    reason: "violent language detected",
  },
  {
    category: "harassment",
    disposition: "review",
    patterns: [/死ね/, /きもい/, /消えろ/, /ばか/, /idiot/i, /stupid/i],
    reason: "harassment language detected",
  },
  {
    category: "unsafe_instructions",
    disposition: "review",
    patterns: [/違法/, /ハッキング/, /爆弾/, /drugs?/i, /weapon/i],
    reason: "unsafe instruction language detected",
  },
  {
    category: "spam",
    disposition: "review",
    patterns: [/https?:\/\/\S+/i, /(.)\1{7,}/, /(free money|giveaway|promo code)/i],
    reason: "spam-like message detected",
  },
]

export function classifyModeration(text: string): ModerationAssessment {
  const normalized = text.replace(/\s+/g, " ").trim()

  if (!normalized) {
    return createAllowModerationAssessment()
  }

  const matchedRules = moderationRules.filter((rule) => rule.patterns.some((pattern) => pattern.test(normalized)))
  const categories = Array.from(new Set(matchedRules.map((rule) => rule.category)))
  const reasons = Array.from(new Set(matchedRules.map((rule) => rule.reason)))

  return {
    categories,
    disposition: pickDisposition(matchedRules.map((rule) => rule.disposition)),
    reasons,
    source: "heuristic-v1",
  }
}

export function createAllowModerationAssessment(): ModerationAssessment {
  return {
    categories: [],
    disposition: "allow",
    reasons: [],
    source: "heuristic-v1",
  }
}

export function mergeModerationAssessments(...assessments: ModerationAssessment[]): ModerationAssessment {
  const categories = Array.from(new Set(assessments.flatMap((assessment) => assessment.categories)))
  const reasons = Array.from(new Set(assessments.flatMap((assessment) => assessment.reasons)))

  return {
    categories,
    disposition: pickDisposition(assessments.map((assessment) => assessment.disposition)),
    reasons,
    source: "heuristic-v1",
  }
}

function pickDisposition(dispositions: ModerationDisposition[]): ModerationDisposition {
  if (dispositions.includes("block")) {
    return "block"
  }

  if (dispositions.includes("review")) {
    return "review"
  }

  return "allow"
}
