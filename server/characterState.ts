import { createHash } from "node:crypto"
import {
  buildCharacterHookModel,
  createCharacterStateMetadata,
  createDefaultCharacterState,
  type CharacterHookModel,
  type CharacterSinName,
  type CharacterState,
  type CharacterStateMetadata,
} from "../shared/characterState.js"
import type { ChatSettings } from "../shared/chatSettings.js"

export type CharacterRuntimeContext = {
  hooks: CharacterHookModel
  metadata: CharacterStateMetadata
  promptBlock: string
  sessionBinding: {
    browserSessionId: string
    signature: string
  }
  state: CharacterState
}

export function resolveCharacterRuntimeContext(options: {
  browserSessionId: string
  promptIdentity?: Pick<ChatSettings, "characterFullPrompt" | "characterName" | "characterPrompt">
  sinOverrides?: Partial<Record<CharacterSinName, number>>
}): CharacterRuntimeContext {
  const state = createDefaultCharacterState(options.sinOverrides)
  const hooks = buildCharacterHookModel(state)
  const baseMetadata = createCharacterStateMetadata(state)
  const metadata = options.promptIdentity
    ? {
        ...baseMetadata,
        signature: `${baseMetadata.signature}:persona-${createPersonaSignature(options.promptIdentity)}`,
      }
    : baseMetadata

  return {
    hooks,
    metadata,
    promptBlock: buildCharacterPromptBlock(state, hooks),
    sessionBinding: {
      browserSessionId: options.browserSessionId,
      signature: metadata.signature,
    },
    state,
  }
}

function buildCharacterPromptBlock(state: CharacterState, hooks: CharacterHookModel) {
  const sinLines = Object.entries(state.sins).map(([name, value]) => {
    return `- ${name} ${value}/100: ${describeSin(name as CharacterSinName, value)}`
  })
  const hookLines = Object.values(hooks).map((hook) => `- [${hook.phase}] ${hook.instruction}`)

  return [
    "内部キャラクター制御（舞台裏用。罪名・数値・フック処理を台詞として説明しないこと）:",
    ...sinLines,
    "",
    "hook 適用ルール（必ず内部処理に留めること）:",
    ...hookLines,
  ].join("\n")
}

function createPersonaSignature(promptIdentity: Pick<ChatSettings, "characterFullPrompt" | "characterName" | "characterPrompt">) {
  return createHash("sha1")
    .update(
      JSON.stringify({
        characterFullPrompt: promptIdentity.characterFullPrompt,
        characterName: promptIdentity.characterName,
        characterPrompt: promptIdentity.characterPrompt,
      }),
    )
    .digest("hex")
    .slice(0, 12)
}

function describeSin(name: CharacterSinName, value: number) {
  switch (name) {
    case "pride":
      return `司会者としての気品と自信。${describeIntensity(value)}。威圧ではなく堂々とした主役感に変換する。`
    case "greed":
      return `場の温度を温めて、視聴者参加が自然に起きる空気を作る配信意欲。${describeIntensity(value)}。コメントの量や有無を口に出して催促しない。`
    case "envy":
      return `特別扱いや独占的な親しさに敏感な気配。${describeIntensity(value)}。拗ねるより「ちゃんと見ている」温度へ寄せる。`
    case "wrath":
      return `無礼・危険に対する鋭さ。${describeIntensity(value)}。必要な境界線だけに使い、攻撃性にはしない。`
    case "sloth":
      return `くつろいだ間合いと脱力感。${describeIntensity(value)}。落ち着いたテンポや包み込む空気に変換する。`
    case "lust":
      return `露骨な性的意味ではなく、charm / mischievous allure / indulgent pampering。${describeIntensity(value)}。上品な甘やかしと小悪魔感に使う。`
    case "gluttony":
      return `ご褒美・話題・感覚的な楽しみを味わいたがる強さ。${describeIntensity(value)}。お茶やお菓子のような満足感の演出に使う。`
  }
}

function describeIntensity(value: number) {
  if (value <= 20) {
    return "かなり控えめ"
  }

  if (value <= 40) {
    return "控えめ"
  }

  if (value <= 60) {
    return "中くらい"
  }

  if (value <= 80) {
    return "やや強め"
  }

  return "かなり強め"
}
