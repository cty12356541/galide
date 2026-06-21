import { describe, it, expect } from 'vitest'
import { parse } from '../../../../shared/dsl/parser'
import type { SceneNode } from '../../../../shared/dsl/types'
import { buildPreviewItems } from './preview-items'

const INTERLEAVED_GAL = `## 测试场景
小雪: "第一句对白"

* "选项 A" -> 目标A
* "选项 B" -> 目标B

小雪: "第二句对白"

* "选项 C" -> 目标C
`

describe('buildPreviewItems', () => {
  it('preserves document-order interleaving of dialogue and choice beats', () => {
    const parsed = parse(INTERLEAVED_GAL)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const scene = parsed.value.children.find((n): n is SceneNode => n.type === 'scene')
    expect(scene).toBeTruthy()
    if (!scene) return

    const items = buildPreviewItems(scene)
    expect(items.map((it) => it.type)).toEqual([
      'dialogue',
      'choice',
      'choice',
      'dialogue',
      'choice'
    ])
    expect(items[0]).toMatchObject({ type: 'dialogue', text: '第一句对白' })
    expect(items[3]).toMatchObject({ type: 'dialogue', text: '第二句对白' })
  })

  it('does not collect all dialogues before all choices (DFS regression)', () => {
    const parsed = parse(INTERLEAVED_GAL)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const scene = parsed.value.children.find((n): n is SceneNode => n.type === 'scene')
    if (!scene) return

    const items = buildPreviewItems(scene)
    const firstChoiceIdx = items.findIndex((it) => it.type === 'choice')
    const lastDialogueBeforeChoice = items
      .slice(0, firstChoiceIdx)
      .filter((it) => it.type === 'dialogue').length
    expect(lastDialogueBeforeChoice).toBe(1)
    expect(items[firstChoiceIdx + 2]?.type).toBe('dialogue')
  })
})
