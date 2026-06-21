import { describe, it, expect } from 'vitest'
import { parse } from '../dsl/parser'
import type { ScriptNode, SceneNode, DialogueNode, ChoiceNode, GotoNode, MarkerNode, BaseNode } from '../dsl/types'
import {
  buildVmGraph,
  createVmState,
  getCurrentStep,
  advanceVm,
  jumpToTarget,
  executeGotoStep
} from './runtime-vm'

const base = (line: number): BaseNode => ({ line, column: 1 })

const makeDialogue = (character: string, text: string): DialogueNode => ({
  ...base(1),
  type: 'dialogue',
  character,
  lines: [text]
})

const makeChoice = (text: string, target: string): ChoiceNode => ({
  ...base(1),
  type: 'choice',
  options: [{ text, target }]
})

const makeGoto = (target: string): GotoNode => ({
  ...base(1),
  type: 'goto',
  target
})

const makeMarker = (id: string): MarkerNode => ({
  ...base(1),
  type: 'marker',
  id
})

const makeScene = (
  id: string,
  children: SceneNode['children']
): SceneNode => ({
  ...base(1),
  type: 'scene',
  id,
  children
})

const makeAst = (children: ScriptNode['children']): ScriptNode => ({
  ...base(1),
  type: 'script',
  children,
  errors: []
})

describe('runtime-vm', () => {
  it('builds marker registry for within-scene and cross-scene markers', () => {
    const ast = makeAst([
      makeScene('A', [
        makeDialogue('X', 'hi'),
        makeMarker('m1'),
        makeDialogue('X', 'after')
      ]),
      makeScene('B', [makeMarker('m2'), makeDialogue('Y', 'b')])
    ])
    const graph = buildVmGraph(ast)
    expect(graph.markers['m1']).toEqual({ sceneId: 'A', stepIndex: 1 })
    expect(graph.markers['m2']).toEqual({ sceneId: 'B', stepIndex: 0 })
  })

  it('advances through steps in order', () => {
    const ast = makeAst([
      makeScene('s1', [makeDialogue('A', 'one'), makeDialogue('A', 'two')])
    ])
    const graph = buildVmGraph(ast)
    const state = createVmState(graph, 's1')
    expect(getCurrentStep(graph, state)?.type).toBe('dialogue')
    const result = advanceVm(graph, state)
    if (result.ok && !result.finished) {
      expect(getCurrentStep(graph, result.state)).toMatchObject({ text: 'two' })
    }
  })

  it('jumpToTarget resolves scene id to scene start', () => {
    const ast = makeAst([
      makeScene('s1', [makeChoice('go', 's2')]),
      makeScene('s2', [makeDialogue('A', 'dest')])
    ])
    const graph = buildVmGraph(ast)
    const state = createVmState(graph, 's1')
    const jumped = jumpToTarget(graph, state, 's2')
    expect(jumped.ok).toBe(true)
    if (!jumped.ok) return
    expect(jumped.state.sceneId).toBe('s2')
    expect(jumped.state.stepIndex).toBe(0)
    expect(getCurrentStep(graph, jumped.state)).toMatchObject({ text: 'dest' })
  })

  it('jumpToTarget resolves marker id to marker step', () => {
    const ast = makeAst([
      makeScene('s1', [
        makeDialogue('A', 'start'),
        makeMarker('checkpoint'),
        makeDialogue('A', 'after marker')
      ])
    ])
    const graph = buildVmGraph(ast)
    const state = createVmState(graph, 's1')
    const jumped = jumpToTarget(graph, state, 'checkpoint')
    expect(jumped.ok).toBe(true)
    if (!jumped.ok) return
    expect(getCurrentStep(graph, jumped.state)).toMatchObject({ type: 'marker', id: 'checkpoint' })
  })

  it('executeGotoStep jumps within and across scenes', () => {
    const ast = makeAst([
      makeScene('A', [makeGoto('B'), makeMarker('local'), makeGoto('local')]),
      makeScene('B', [makeDialogue('X', 'in B')])
    ])
    const graph = buildVmGraph(ast)
    let state = createVmState(graph, 'A')
    const cross = executeGotoStep(graph, state, { target: 'B' })
    expect(cross.ok).toBe(true)
    if (!cross.ok) return
    expect(getCurrentStep(graph, cross.state)).toMatchObject({ text: 'in B' })

    state = createVmState(graph, 'A')
    const local = executeGotoStep(graph, state, { target: 'local' })
    expect(local.ok).toBe(true)
    if (!local.ok) return
    expect(getCurrentStep(graph, local.state)).toMatchObject({ type: 'marker', id: 'local' })
  })

  it('returns error for invalid jump target', () => {
    const ast = makeAst([makeScene('s1', [makeDialogue('A', 'hi')])])
    const graph = buildVmGraph(ast)
    const state = createVmState(graph, 's1')
    const r = jumpToTarget(graph, state, 'nonexistent')
    expect(r.ok).toBe(false)
    if (r.ok === false) {
      expect(r.error).toContain('nonexistent')
    }
  })

  it('parses real .gal with goto/marker into playable graph', () => {
    const gal = `## 场景A
小雪: "开头"
=== 标记点 ===
[跳转:场景B]

## 场景B
小雪: "到了"
`
    const parsed = parse(gal)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const graph = buildVmGraph(parsed.value)
    expect(Object.keys(graph.scenes)).toEqual(['场景A', '场景B'])
    expect(graph.scenes['场景A']?.steps.map((s) => s.type)).toEqual([
      'dialogue',
      'marker',
      'goto'
    ])
  })
})
