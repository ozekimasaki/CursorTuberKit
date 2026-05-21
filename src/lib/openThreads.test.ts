import { describe, expect, it } from 'vitest'

import { extractOpenThreads } from './openThreads'

type Turn = Parameters<typeof extractOpenThreads>[0][number]

const assistant = (text: string): Turn => ({ role: 'assistant', text })
const user = (text: string): Turn => ({ role: 'user', text })

describe('extractOpenThreads', () => {
  it('extracts only repeated unresolved assistant-side tags', () => {
    const turns: Turn[] = [
      assistant('アールグレイの香りをあとで深掘りしたいです。'),
      user('アールグレイ気になる'),
      assistant('アールグレイと焼菓子の相性も覚えておきたいです。'),
      assistant('猫耳の角度を少し直します。'),
      assistant('月明かりのステージにします。'),
      assistant('珈琲の話も少しだけ。'),
    ]

    expect(extractOpenThreads(turns)).toEqual([
      {
        tag: 'アールグレイ',
        snippet: 'アールグレイと焼菓子の相性も覚えておきたいです。',
        lastSeenTurnIndex: 1,
      },
    ])
  })

  it('covers frequency, stopword, recent-window, max-count, and snippet rules', () => {
    const longSnackSnippet = `焼菓子の余韻をかなり長く説明して、香りや食感や温度まで細かく残しておきたいです。${'余韻'.repeat(20)}`
    const cases: Array<{ name: string; input: Turn[]; assert: (tags: ReturnType<typeof extractOpenThreads>) => void }> = [
      {
        name: 'frequency >= 2 is required',
        input: [
          assistant('単発タグだけを残します。'),
          assistant('別話題へ移ります。'),
        ],
        assert: (tags) => expect(tags).toEqual([]),
      },
      {
        name: 'domain stopwords are filtered',
        input: [
          assistant('配信 コメント 視聴者 の話です。'),
          assistant('配信 コメント 視聴者 をもう一度。'),
          assistant('別話題です。'),
          assistant('月明かりです。'),
          assistant('猫耳です。'),
        ],
        assert: (tags) => expect(tags).toEqual([]),
      },
      {
        name: 'tokens in the last three assistant turns are treated as resolved',
        input: [
          assistant('温泉街の話をします。'),
          assistant('月明かりです。'),
          assistant('温泉街に戻りました。'),
          assistant('別話題です。'),
        ],
        assert: (tags) => expect(tags.some((tag) => tag.tag === '温泉街')).toBe(false),
      },
      {
        name: 'returns at most three tags',
        input: [
          assistant('アールグレイ 焼菓子 月明かり 温泉街'),
          assistant('アールグレイ 焼菓子 月明かり 温泉街'),
          assistant('猫耳です。'),
          assistant('珈琲です。'),
          assistant('星空です。'),
        ],
        assert: (tags) => expect(tags).toHaveLength(3),
      },
      {
        name: 'snippet is capped to 60 chars',
        input: [
          assistant(longSnackSnippet),
          assistant(longSnackSnippet),
          assistant('猫耳です。'),
          assistant('珈琲です。'),
          assistant('星空です。'),
        ],
        assert: (tags) => expect(tags[0]?.snippet.length).toBeLessThanOrEqual(60),
      },
      {
        name: 'user turns are ignored',
        input: [
          user('アールグレイ アールグレイ'),
          assistant('猫耳です。'),
          assistant('珈琲です。'),
        ],
        assert: (tags) => expect(tags).toEqual([]),
      },
    ]

    for (const testCase of cases) {
      testCase.assert(extractOpenThreads(testCase.input))
    }
  })
})
