import { describe, expect, it } from 'vitest'

import { createDefaultChatSettings } from '../shared/chatSettings.js'
import { resolveCharacterRuntimeContext } from './characterState.js'
import { buildAvatarPrompt } from './aiCommon.js'
import {
  readCharacterRuleSource,
  renderCharacterRuleContent,
  validateCharacterRuleContent,
} from './characterRuleSource.js'

describe('character rule source', () => {
  it('loads the committed sample rule as app-owned prompt content', async () => {
    const source = await readCharacterRuleSource()

    expect(source.status.loaded).toBe(true)
    expect(source.status.path).toBe('.cursor/rules/cursortuber-character.mdc')
    expect(source.content).toContain('CursorTuberKit サンプル人格ルール')
    expect(source.content).toContain('キャットリン')
    expect(source.characterPrompt).toContain('役割:')
    expect(source.characterFullPrompt).toContain('{{characterPrompt}}')
    expect(source.runtimeRuleContent).toContain('サンプル人格: キャットリン')
    expect(source.runtimeRuleContent).not.toContain('```text')
    expect(source.content).not.toContain('alwaysApply')
  })

  it('rejects malformed rule content and obvious secrets before writing', () => {
    expect(() => validateCharacterRuleContent('safe\n---\nunsafe')).toThrow(/frontmatter/)
    expect(() => validateCharacterRuleContent('CURSOR_API_KEY=crsr_abcdefghijklmnop')).toThrow(/secret/)
  })

  it('renders placeholders without mutating the stored rule text', () => {
    const rendered = renderCharacterRuleContent('Speak as {{characterName}}.\n{{characterPrompt}}', {
      characterName: 'テストさん',
      characterPrompt: '声: やわらかい',
    })

    expect(rendered).toContain('Speak as テストさん.')
    expect(rendered).toContain('声: やわらかい')
  })

  it('merges explicit repo rule text into the avatar prompt once', () => {
    const settings = createDefaultChatSettings()
    const prompt = buildAvatarPrompt('こんばんは', {
      characterRuleContent: 'Unique repo voice marker for tests.',
      chatSettings: settings,
    })

    expect(prompt.match(/Unique repo voice marker for tests\./g)).toHaveLength(1)
    expect(prompt).toContain('リポジトリ人格ルール')
  })

  it('includes repo rule content in the character session signature', () => {
    const settings = createDefaultChatSettings()
    const first = resolveCharacterRuntimeContext({
      browserSessionId: 'test',
      promptIdentity: {
        characterFullPrompt: settings.characterFullPrompt,
        characterName: settings.characterName,
        characterPrompt: settings.characterPrompt,
        characterRuleContent: 'rule one',
      },
    })
    const second = resolveCharacterRuntimeContext({
      browserSessionId: 'test',
      promptIdentity: {
        characterFullPrompt: settings.characterFullPrompt,
        characterName: settings.characterName,
        characterPrompt: settings.characterPrompt,
        characterRuleContent: 'rule two',
      },
    })

    expect(first.metadata.signature).not.toBe(second.metadata.signature)
  })
})
