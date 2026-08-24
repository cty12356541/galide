/**
 * 多角色舞台 DSL 单测 — 登场/退场解析 + 舞台状态推导
 */
import { describe, it, expect } from 'vitest'
import { parse } from './parser.js'
import { buildVmGraph, computeStageState, createVmState, advanceVm } from '../preview/runtime-vm.js'
import { detectLineType } from './line-rules.js'
import type { SceneNode, StageEntryNode, StageExitNode } from './types.js'

const src = `## s1
[登场: 小雪 | 立绘:xue_smile.png | 位置:左]
[登场: 阳 | 立绘:yang_cool.png | 位置:右]
小雪: "两个人都在。"
阳: "嗯。"
[退场: 阳]
小雪: "只剩我了。"
`

describe('登场/退场 行类型', () => {
  it('detectLineType 识别', () => {
    expect(detectLineType('[登场: 小雪 | 立绘:a.png | 位置:左]')).toBe('stageEntry')
    expect(detectLineType('[enter: H | sprite:a.png]')).toBe('stageEntry')
    expect(detectLineType('[退场: 小雪]')).toBe('stageExit')
    expect(detectLineType('[exit: H]')).toBe('stageExit')
  })
})

describe('登场/退场 解析', () => {
  it('生成 StageEntryNode / StageExitNode', () => {
    const r = parse(src)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const scene = r.value.children.find((n): n is SceneNode => n.type === 'scene')
    const kids = scene?.children ?? []
    const entry = kids.find((n): n is StageEntryNode => n.type === 'stageEntry')
    const exit = kids.find((n): n is StageExitNode => n.type === 'stageExit')
    expect(entry).toMatchObject({
      type: 'stageEntry',
      character: '小雪',
      sprite: 'xue_smile.png',
      position: 'left'
    })
    expect(kids.find((n) => n.type === 'stageEntry' && n.character === '阳')).toMatchObject({
      sprite: 'yang_cool.png',
      position: 'right'
    })
    expect(exit).toMatchObject({ type: 'stageExit', character: '阳' })
  })
})

describe('computeStageState 舞台推导', () => {
  it('双角色同屏 → 退场后单人', async () => {
    const r = parse(src)
    if (!r.ok) return
    const graph = buildVmGraph(r.value)
    let state = createVmState(graph, 's1')
    // 快进过两条登场 + 第一句对白
    for (let i = 0; i < 3; i++) {
      const step = advanceVm(graph, state)
      if (step.ok) state = step.state
    }
    const mid = computeStageState(graph, state)
    expect(Object.keys(mid).sort()).toEqual(['小雪', '阳'])
    expect(mid['小雪']).toMatchObject({ sprite: 'xue_smile.png', position: 'left' })
    expect(mid['阳']).toMatchObject({ sprite: 'yang_cool.png', position: 'right' })
    // 过第二句 + 退场 + 末句
    for (let i = 0; i < 3; i++) {
      const step = advanceVm(graph, state)
      if (step.ok) state = step.state
    }
    const end = computeStageState(graph, state)
    expect(Object.keys(end)).toEqual(['小雪'])
  })

  it('说话角色粘性立绘更新自己的槽位', () => {
    const r2 = parse(`## s2
[登场: 小雪 | 立绘:a.png | 位置:左]
[登场: 阳 | 立绘:b.png | 位置:右]
小雪: "第一句"
[角色: 小雪 | 立绘:a2.png | 位置:左]
小雪: "换表情"
`)
    if (!r2.ok) return
    const graph = buildVmGraph(r2.value)
    let state = createVmState(graph, 's2')
    for (let i = 0; i < 4; i++) {
      const step = advanceVm(graph, state)
      if (step.ok) state = step.state
    }
    const stage = computeStageState(graph, state)
    expect(stage['小雪']).toMatchObject({ sprite: 'a2.png', position: 'left' })
    expect(stage['阳']).toMatchObject({ sprite: 'b.png', position: 'right' })
  })
})
