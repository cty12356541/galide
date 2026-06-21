/**
 * VM 变量/条件求值测试
 */
import { describe, expect, it } from 'vitest'
import { parse } from '../dsl/parser'
import {
  applySetStep,
  buildVmGraph,
  createVmState,
  filterChoiceOptions,
  getCurrentStep,
  resolveIfStep,
  advanceVm,
  type VmState
} from './runtime-vm'
import type { PlaybackIfStep, PlaybackSetStep } from './playback-timeline'

describe('runtime-vm variables', () => {
  it('applySetStep sets/adds/subtracts variables', () => {
    const state: VmState = { sceneId: 's1', stepIndex: 0, variables: { affinity: 5 } }
    const set10: PlaybackSetStep = {
      type: 'set',
      name: 'affinity',
      op: 'set',
      value: { kind: 'literal', value: 10 }
    }
    expect(applySetStep(state, set10).variables.affinity).toBe(10)

    const add5: PlaybackSetStep = {
      type: 'set',
      name: 'affinity',
      op: 'add',
      value: { kind: 'literal', value: 5 }
    }
    expect(applySetStep(state, add5).variables.affinity).toBe(10)

    const sub3: PlaybackSetStep = {
      type: 'set',
      name: 'affinity',
      op: 'sub',
      value: { kind: 'literal', value: 3 }
    }
    expect(applySetStep(state, sub3).variables.affinity).toBe(2)
  })

  it('resolveIfStep picks first matching branch', () => {
    const step: PlaybackIfStep = {
      type: 'if',
      branches: [
        {
          kind: 'if',
          condition: { kind: 'binary', op: 'ge', left: { kind: 'var', name: 'affinity' }, right: { kind: 'literal', value: 10 } },
          steps: [{ type: 'dialogue', character: 'A', text: 'high' }]
        },
        {
          kind: 'else',
          steps: [{ type: 'dialogue', character: 'A', text: 'low' }]
        }
      ]
    }
    const high = resolveIfStep({ sceneId: 's1', stepIndex: 0, variables: { affinity: 15 } }, step)
    expect(high[0]).toMatchObject({ text: 'high' })
    const low = resolveIfStep({ sceneId: 's1', stepIndex: 0, variables: { affinity: 3 } }, step)
    expect(low[0]).toMatchObject({ text: 'low' })
  })

  it('filterChoiceOptions hides gated options when condition false', () => {
    const options = [
      { text: 'secret', target: 'a', condition: { kind: 'binary' as const, op: 'ge' as const, left: { kind: 'var' as const, name: 'affinity' }, right: { kind: 'literal' as const, value: 10 } } },
      { text: 'normal', target: 'b' }
    ]
    const visible = filterChoiceOptions(options, { affinity: 5 })
    expect(visible.map((o) => o.text)).toEqual(['normal'])
    const visible2 = filterChoiceOptions(options, { affinity: 15 })
    expect(visible2.map((o) => o.text)).toEqual(['secret', 'normal'])
  })

  it('branches playback by variable state from .gal', () => {
    const gal = `## s1
设: affinity = 0
设: affinity += 15
[若: affinity >= 10]
小雪: "高好感路线"
[否则]
小雪: "低好感路线"
[若终]
`
    const parsed = parse(gal)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const graph = buildVmGraph(parsed.value)
    let state = createVmState(graph, 's1')
    // advance through set steps
    state = advanceVm(graph, state).ok && !advanceVm(graph, state).finished ? advanceVm(graph, state).ok ? (advanceVm(graph, state) as { ok: true; state: VmState }).state : state : state
    // simpler: loop advance until dialogue
    for (let i = 0; i < 10; i++) {
      const step = getCurrentStep(graph, state)
      if (step?.type === 'set') {
        state = applySetStep(state, step)
        const r = advanceVm(graph, state)
        if (r.ok && !r.finished) state = r.state
        continue
      }
      if (step?.type === 'if') {
        const branch = resolveIfStep(state, step)
        expect(branch[0]).toMatchObject({ text: '高好感路线' })
        return
      }
      const r = advanceVm(graph, state)
      if (!r.ok || r.finished) break
      state = r.state
    }
  })
})
