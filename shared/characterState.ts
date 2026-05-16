export const characterSinNames = ["pride", "greed", "envy", "wrath", "sloth", "lust", "gluttony"] as const
export type CharacterSinName = (typeof characterSinNames)[number]

export const characterHookPhases = ["pre-reply", "relationship", "segment", "memory-write", "lore"] as const
export type CharacterHookPhase = (typeof characterHookPhases)[number]

export const characterStateSchemaVersion = 1 as const
export const characterSinValueMin = 0 as const
export const characterSinValueMax = 100 as const
export const characterLustInterpretation = "stream-safe-charm" as const

export type CharacterSinValues = Record<CharacterSinName, number>

export type CharacterState = {
  schemaVersion: typeof characterStateSchemaVersion
  sins: CharacterSinValues
}

export type CharacterHookDirective = {
  hidden: true
  influences: CharacterSinName[]
  instruction: string
  phase: CharacterHookPhase
  title: string
}

export type CharacterHookModel = Record<CharacterHookPhase, CharacterHookDirective>

export type CharacterStateMetadata = {
  hookPhases: CharacterHookPhase[]
  hookVisibility: "internal-only"
  lustInterpretation: typeof characterLustInterpretation
  schemaVersion: typeof characterStateSchemaVersion
  signature: string
}

const defaultCharacterSinValues: CharacterSinValues = {
  envy: 50,
  gluttony: 50,
  greed: 50,
  lust: 50,
  pride: 50,
  sloth: 50,
  wrath: 50,
}

export function clampCharacterSinValue(value: number) {
  if (!Number.isFinite(value)) {
    return characterSinValueMin
  }

  return Math.min(characterSinValueMax, Math.max(characterSinValueMin, Math.round(value)))
}

export function normalizeCharacterSinValues(input?: Partial<Record<CharacterSinName, number>>): CharacterSinValues {
  return {
    envy: clampCharacterSinValue(input?.envy ?? defaultCharacterSinValues.envy),
    gluttony: clampCharacterSinValue(input?.gluttony ?? defaultCharacterSinValues.gluttony),
    greed: clampCharacterSinValue(input?.greed ?? defaultCharacterSinValues.greed),
    lust: clampCharacterSinValue(input?.lust ?? defaultCharacterSinValues.lust),
    pride: clampCharacterSinValue(input?.pride ?? defaultCharacterSinValues.pride),
    sloth: clampCharacterSinValue(input?.sloth ?? defaultCharacterSinValues.sloth),
    wrath: clampCharacterSinValue(input?.wrath ?? defaultCharacterSinValues.wrath),
  }
}

export function createDefaultCharacterState(overrides?: Partial<Record<CharacterSinName, number>>): CharacterState {
  return {
    schemaVersion: characterStateSchemaVersion,
    sins: normalizeCharacterSinValues(overrides),
  }
}

export function createCharacterStateSignature(state: Pick<CharacterState, "sins">) {
  return `v${characterStateSchemaVersion}:${characterSinNames.map((name) => `${name}-${state.sins[name]}`).join("_")}`
}

export function createCharacterStateMetadata(state: CharacterState): CharacterStateMetadata {
  return {
    hookPhases: [...characterHookPhases],
    hookVisibility: "internal-only",
    lustInterpretation: characterLustInterpretation,
    schemaVersion: state.schemaVersion,
    signature: createCharacterStateSignature(state),
  }
}

export function buildCharacterHookModel(state: CharacterState): CharacterHookModel {
  const { envy, gluttony, greed, lust, pride, sloth, wrath } = state.sins

  return {
    lore: {
      hidden: true,
      influences: ["pride", "sloth", "gluttony"],
      instruction: [
        `月灯りのティーサロンの主としての気品は ${describeLevel(pride)}。`,
        `くつろいだ余裕は ${describeLevel(sloth)}、ご褒美や香りへの嗜好は ${describeLevel(gluttony)}。`,
        "背景描写はほんのり添える程度にし、設定説明で会話を止めない。",
      ].join(" "),
      phase: "lore",
      title: "Lore framing",
    },
    "memory-write": {
      hidden: true,
      influences: ["envy", "lust", "gluttony", "pride"],
      instruction: [
        `覚えるのは「誰が何を好むか」「どんな甘やかしや呼び方が刺さったか」「また拾いたい話題」。`,
        `lust ${lust}/100 は配信向けの charm / mischievous allure / indulgent pampering として扱い、露骨な性的意味にしない。`,
        `envy ${envy}/100 は特別扱いしたくなる相手や、次回も拾いたい関係の兆しとして整理する。`,
      ].join(" "),
      phase: "memory-write",
      title: "Memory curation",
    },
    "pre-reply": {
      hidden: true,
      influences: ["pride", "lust", "sloth", "wrath"],
      instruction: [
        `返答前に pride ${pride}/100 の司会者らしい気品、lust ${lust}/100 の愛嬌、sloth ${sloth}/100 のくつろいだ間を混ぜて姿勢を決める。`,
        `wrath ${wrath}/100 は無礼・危険な流れを柔らかく止める境界線にだけ使う。`,
        "数値・罪名・内部フックの存在は台詞に出さない。",
      ].join(" "),
      phase: "pre-reply",
      title: "Pre-reply calibration",
    },
    relationship: {
      hidden: true,
      influences: ["lust", "envy", "greed", "pride"],
      instruction: [
        `視聴者との距離感は lust ${lust}/100 の甘やかしと小悪魔的な charm、envy ${envy}/100 の「ちゃんと見ている」感、greed ${greed}/100 のもっと構いたい配信欲で調整する。`,
        `pride ${pride}/100 があるので、迎合しすぎず「配信の主」として包み込む。`,
      ].join(" "),
      phase: "relationship",
      title: "Relationship shaping",
    },
    segment: {
      hidden: true,
      influences: ["sloth", "gluttony", "wrath", "greed"],
      instruction: [
        `字幕と音声の区切りは sloth ${sloth}/100 なら落ち着いて、gluttony ${gluttony}/100 ならご褒美感のある語を少し濃くする。`,
        `greed ${greed}/100 は次のコメントを欲しがる余韻へ、wrath ${wrath}/100 はきっぱり感が必要な一文へだけ使う。`,
        "1 セグメントごとに言い回しの圧を上げすぎず、配信向けの読みやすさを優先する。",
      ].join(" "),
      phase: "segment",
      title: "Segment pacing",
    },
  }
}

function describeLevel(value: number) {
  if (value <= 20) {
    return "かなり控えめ"
  }

  if (value <= 40) {
    return "控えめ"
  }

  if (value <= 60) {
    return "ほどよく前に出る"
  }

  if (value <= 80) {
    return "はっきり効いている"
  }

  return "かなり強い"
}
