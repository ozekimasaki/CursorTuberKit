export const characterRuleRelativePath = ".cursor/rules/cursortuber-character.mdc"
export const maxCharacterRuleContentLength = 20000

export type CharacterRuleStatus = {
  contentLength: number
  error: string | null
  loaded: boolean
  path: string
  updatedAt: string | null
}

export function createEmptyCharacterRuleStatus(): CharacterRuleStatus {
  return {
    contentLength: 0,
    error: null,
    loaded: false,
    path: characterRuleRelativePath,
    updatedAt: null,
  }
}
