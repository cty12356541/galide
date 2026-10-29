/**
 * vm-debugger 单测(Phase 2 T2-1)
 *
 * 覆盖:
 * - 断点命中暂停(pausedAt 携带 markerId / sceneId / stepIndex)
 * - 未设断点的 marker 不停(continue 自动越过)
 * - continue 从暂停断点恢复运行至下一断点或剧本结束
 * - step 单步语义保持且落到断点时暂停
 * - getVariables 返回隔离副本
 * - watch 回调在 设: 与 [若:]/[否则] 分支变量演进时精确触发
 */
import { describe, it, expect, vi } from 'vitest'
import { parse } from '../dsl/parser'
import {
  buildVmGraph,
  createVmDebugger,
  createVmState,
  getCurrentStep,
  getVariables
} from './runtime-vm'

const buildGraphFromSource = (source: string) => {
  const parsed = parse(source)
  if (!parsed.ok) {
    throw new Error(`Fixture parse failed: ${JSON.stringify(parsed.error)}`)
  }
  return buildVmGraph(parsed.value)
}

describe('vm-debugger (T2-1)', () => {
  const sampleScript = [
    '## ch1',
    '旁白: "开场第一句"',
    '设: affinity = 5',
    '=== pass_marker ===',
    '设: affinity += 10',
    '[若: affinity >= 12]',
    '设: route = "true_end"',
    '=== branch_bp ===',
    '小雪: "进入真结局分支"',
    '[否则]',
    '设: route = "normal"',
    '=== else_bp ===',
    '小雪: "进入普通分支"',
    '[若终]',
    '=== tail_bp ===',
    '旁白: "场景收尾"'
  ].join('\n')

  it('pauses on matching marker breakpoint, skips non-breakpoint markers, and resumes on continue()', () => {
    const graph = buildGraphFromSource(sampleScript)
    const state0 = createVmState(graph, 'ch1')
    const dbg = createVmDebugger({ breakpoints: ['branch_bp', 'tail_bp'] })

    // 1. continue() skips pass_marker (not in breakpoints) and pauses at branch_bp inside [若:]
    const hit1 = dbg.continue(graph, state0)
    expect(hit1.ok).toBe(true)
    expect(hit1.stopReason).toBe('breakpoint')
    expect(hit1.pausedAt?.markerId).toBe('branch_bp')
    expect(hit1.pausedAt?.sceneId).toBe('ch1')
    expect(dbg.getPausedAt()?.markerId).toBe('branch_bp')
    expect(dbg.getVariables(hit1.state)).toEqual({
      affinity: 15,
      route: 'true_end'
    })

    // 2. continue() from branch_bp resumes past branch_bp and pauses at tail_bp
    const hit2 = dbg.continue(graph, hit1.state)
    expect(hit2.ok).toBe(true)
    expect(hit2.stopReason).toBe('breakpoint')
    expect(hit2.pausedAt?.markerId).toBe('tail_bp')
    expect(dbg.getPausedAt()?.markerId).toBe('tail_bp')

    // 3. continue() from tail_bp runs through final dialogue to completion
    const done = dbg.continue(graph, hit2.state)
    expect(done.ok).toBe(true)
    if (done.ok) {
      expect(done.finished).toBe(true)
      expect(done.stopReason).toBe('finished')
      expect(done.pausedAt).toBeNull()
    }
    expect(dbg.getPausedAt()).toBeNull()
  })

  it('getVariables returns a defensive shallow copy', () => {
    const graph = buildGraphFromSource(sampleScript)
    const dbg = createVmDebugger({ breakpoints: ['branch_bp'] })
    const hit = dbg.continue(graph, createVmState(graph, 'ch1'))
    const snap = getVariables(hit.state)
    expect(snap).toEqual({ affinity: 15, route: 'true_end' })

    snap.affinity = 999
    snap.injected = true
    expect(getVariables(hit.state)).toEqual({ affinity: 15, route: 'true_end' })
  })

  it('watch subscription fires on variable mutations including [若:]/[否则] branches and unsubscribes cleanly', () => {
    const elseScript = sampleScript.replace('设: affinity += 10', '设: affinity += 1')
    const graph = buildGraphFromSource(elseScript)
    const dbg = createVmDebugger({ breakpoints: ['else_bp'] })

    const events: Array<{
      vars: Record<string, unknown>
      keys: string[]
    }> = []
    const unsub = dbg.watch((vars, changes) => {
      events.push({
        vars,
        keys: changes.map((c) => `${c.key}:${String(c.previousValue)}->${String(c.nextValue)}`)
      })
    })

    const hit = dbg.continue(graph, createVmState(graph, 'ch1'))
    expect(hit.stopReason).toBe('breakpoint')
    expect(hit.pausedAt?.markerId).toBe('else_bp')
    expect(events).toEqual([
      { vars: { affinity: 5 }, keys: ['affinity:undefined->5'] },
      { vars: { affinity: 6 }, keys: ['affinity:5->6'] },
      { vars: { affinity: 6, route: 'normal' }, keys: ['route:undefined->normal'] }
    ])

    unsub()
    const spy = vi.fn()
    const unsub2 = dbg.watch(spy)
    unsub2()
    dbg.notifyVariablesIfChanged({ a: 1 }, { a: 2 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('step() preserves single-step semantics while marking pausedAt when landing on a breakpoint', () => {
    const graph = buildGraphFromSource(sampleScript)
    const dbg = createVmDebugger({ breakpoints: ['branch_bp'] })
    const s0 = dbg.enter(graph, createVmState(graph, 'ch1'))
    expect(s0.ok).toBe(true)
    expect(getCurrentStep(graph, s0.state)).toMatchObject({
      type: 'dialogue',
      text: '开场第一句'
    })

    // Step 1: past opening dialogue + 设: affinity = 5 -> lands on pass_marker (not a breakpoint)
    const s1 = dbg.step(graph, s0.state)
    expect(s1.stopReason).toBe('step')
    expect(s1.pausedAt).toBeNull()
    expect(getCurrentStep(graph, s1.state)).toMatchObject({
      type: 'marker',
      id: 'pass_marker'
    })
    expect(dbg.getVariables(s1.state)).toEqual({ affinity: 5 })

    // Step 2: past pass_marker + 设: affinity += 10 + enters [若:] + 设: route = "true_end" -> lands on branch_bp!
    const s2 = dbg.step(graph, s1.state)
    expect(s2.stopReason).toBe('breakpoint')
    expect(s2.pausedAt?.markerId).toBe('branch_bp')
    expect(dbg.getVariables(s2.state)).toEqual({ affinity: 15, route: 'true_end' })

    // Step 3: single-steps off branch_bp onto dialogue inside [若:]
    const s3 = dbg.step(graph, s2.state)
    expect(s3.stopReason).toBe('step')
    expect(s3.pausedAt).toBeNull()
    expect(getCurrentStep(graph, s3.state)).toMatchObject({
      type: 'dialogue',
      character: '小雪',
      text: '进入真结局分支'
    })
  })

  it('stops continue() at interactive choice when no breakpoint precedes it', () => {
    const choiceScript = [
      '## start',
      '旁白: "选择前对白"',
      '* "去结局A" -> end_a',
      '* "去结局B" -> end_b',
      '## end_a',
      '旁白: "A"',
      '## end_b',
      '旁白: "B"'
    ].join('\n')
    const graph = buildGraphFromSource(choiceScript)
    const dbg = createVmDebugger()
    const res = dbg.continue(graph, createVmState(graph, 'start'))
    expect(res.ok).toBe(true)
    expect(res.stopReason).toBe('choice')
    expect(res.pausedAt).toBeNull()
    expect(getCurrentStep(graph, res.state)?.type).toBe('choice')
  })
})
