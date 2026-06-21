import { describe, it, expect } from 'vitest'
import { parse } from '../dsl/parser'
import type { SceneNode } from '../dsl/types'
import { buildPlaybackTimeline } from './playback-timeline'

const INTERLEAVED_GAL = `## 测试场景
小雪: "第一句对白"

* "选项 A" -> 目标A
* "选项 B" -> 目标B

小雪: "第二句对白"

* "选项 C" -> 目标C
`

const SPRITE_GAL = `## 立绘场景
[角色:小雪 | 立绘:a.png | 位置:left]
小雪: "带立绘"

小雪: "同立绘"

[角色:小雪 | 立绘:b.png | 位置:right]
小雪: "换立绘"
`

const GOTO_MARKER_GAL = `## 场景A
小雪: "开头"
=== 标记点 ===
小雪: "标记后"
[跳转:场景B]

## 场景B
小雪: "场景B"
`

describe('buildPlaybackTimeline', () => {
  it('preserves document-order interleaving of dialogue and choice beats', () => {
    const parsed = parse(INTERLEAVED_GAL)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const scene = parsed.value.children.find((n): n is SceneNode => n.type === 'scene')
    expect(scene).toBeTruthy()
    if (!scene) return

    const steps = buildPlaybackTimeline(scene)
    expect(steps.map((s) => s.type)).toEqual([
      'dialogue',
      'choice',
      'choice',
      'dialogue',
      'choice'
    ])
    expect(steps[0]).toMatchObject({ type: 'dialogue', text: '第一句对白' })
    expect(steps[3]).toMatchObject({ type: 'dialogue', text: '第二句对白' })
  })

  it('includes goto and marker steps in document order', () => {
    const parsed = parse(GOTO_MARKER_GAL)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const sceneA = parsed.value.children.find(
      (n): n is SceneNode => n.type === 'scene' && n.id === '场景A'
    )
    expect(sceneA).toBeTruthy()
    if (!sceneA) return

    const steps = buildPlaybackTimeline(sceneA)
    expect(steps.map((s) => s.type)).toEqual(['dialogue', 'marker', 'dialogue', 'goto'])
    expect(steps[1]).toMatchObject({ type: 'marker', id: '标记点' })
    expect(steps[3]).toMatchObject({ type: 'goto', target: '场景B' })
  })

  it('carries sprite/position on dialogue steps (VN sticky semantics)', () => {
    const parsed = parse(SPRITE_GAL)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const scene = parsed.value.children.find((n): n is SceneNode => n.type === 'scene')
    if (!scene) return

    const steps = buildPlaybackTimeline(scene)
    const dialogues = steps.filter((s) => s.type === 'dialogue')
    expect(dialogues[0]).toMatchObject({
      sprite: 'a.png',
      position: 'left',
      text: '带立绘'
    })
    expect(dialogues[1]).toMatchObject({
      sprite: 'a.png',
      position: 'left',
      text: '同立绘'
    })
    expect(dialogues[2]).toMatchObject({
      sprite: 'b.png',
      position: 'right',
      text: '换立绘'
    })
  })
})
