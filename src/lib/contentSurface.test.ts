import { describe, expect, it } from 'vitest'

import { deriveCharacterContentSurface } from './contentSurface'

type Input = Parameters<typeof deriveCharacterContentSurface>[0]

const baseInput = (overrides: Partial<Input> = {}): Input => ({
  finalEmotion: null,
  latestRunRecap: null,
  providerMetadata: null,
  recentTurns: [],
  responseText: '',
  sessionMetadata: null,
  liveViewerEvents: [],
  ...overrides,
})

describe('deriveCharacterContentSurface', () => {
  it('does not crash with empty autopilot context', () => {
    const surface = deriveCharacterContentSurface(baseInput())

    expect(surface.suggestions).toHaveLength(5)
    expect(surface.suggestions.map((suggestion) => suggestion.id)).toEqual([
      'opening',
      'mini-corner',
      'recap',
      'teaser',
      'chapter-break',
    ])
    expect(surface.tone.label).toBe('本文ベースのトーン')
    expect(surface.tone.detail).toBe('final emotion 到着前は本文から暫定トーンを表示します。')
  })

  it('derives expected suggestion copy for each surface item', () => {
    const surface = deriveCharacterContentSurface(
      baseInput({
        responseText: '紅茶の香りが広がったね。次は焼菓子も合わせたい。',
        latestRunRecap: {
          durationMs: 1200,
          emotion: null,
          error: null,
          finishedAt: '2026-01-01T00:00:01.000Z',
          id: 'run-1',
          memKraftPersisted: false,
          promptLength: 40,
          provider: 'cursor',
          recentTurnsCount: 2,
          responseLength: 20,
          responsePreview: '直近の紅茶トーク',
          startedAt: '2026-01-01T00:00:00.000Z',
          status: 'completed',
        },
      }),
    )

    const cases = [
      { id: 'opening', title: 'Opening', summaryIncludes: '第一声' },
      { id: 'mini-corner', title: 'Mini corner', summaryIncludes: '紅茶の香りが広がったね' },
      { id: 'recap', title: 'Recap', summaryIncludes: '直近の紅茶トーク' },
      { id: 'teaser', title: 'Teaser', summaryIncludes: '次の話題' },
      { id: 'chapter-break', title: 'Chapter break', summaryIncludes: '区切り' },
    ] as const

    for (const testCase of cases) {
      const suggestion = surface.suggestions.find((item) => item.id === testCase.id)
      expect(suggestion?.title, testCase.id).toBe(testCase.title)
      expect(suggestion?.summary, testCase.id).toContain(testCase.summaryIncludes)
      expect(suggestion?.prompt.length, testCase.id).toBeGreaterThan(0)
    }
  })
})

describe('selectAutomaticContentSuggestion', () => {
  // TODO(test): contentSurface.ts does not currently expose the pure suggestion-selection helper.
  it.skip('covers weighted chapter-break/recap/mini-corner/teaser/opening selection once exported', () => undefined)
})
