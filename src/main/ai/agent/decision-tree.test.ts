/**
 * decision-tree 单测 — 可达性 / 死路检测(纯函数,基于 walkScript)
 *
 * 供 Phase 2 确定性 Critic + Phase 4 决策树分析工具复用。
 */
import { describe, it, expect } from 'vitest'
import { analyzeReachability } from './decision-tree.js'
import type { ScriptNode, SceneNode, ChoiceNode, GotoNode } from '../../../shared/dsl/types.js'

const scene = (id: string, children: SceneNode['children'] = []): SceneNode => ({
  type: 'scene',
  id,
  line: 0,
  column: 1,
  children
})

const choice = (text: string, target: string): ChoiceNode => ({
  type: 'choice',
  line: 0,
  column: 1,
  options: [{ text, target }]
})

const goto = (target: string): GotoNode => ({ type: 'goto', target, line: 0, column: 1 })

const script = (children: ScriptNode['children']): ScriptNode => ({
  type: 'script',
  line: 1,
  column: 1,
  children,
  errors: []
})

describe('analyzeReachability', () => {
  it('从首个场景 BFS 计算可达 / 不可达', () => {
    const ast = script([
      scene('start', [choice('去走廊', 'hallway'), choice('去屋顶', 'rooftop')]),
      scene('hallway', [goto('start')]),
      scene('rooftop', []),
      scene('orphan', [])
    ])
    const r = analyzeReachability(ast)
    expect(r.entry).toBe('start')
    expect(r.reachable.sort()).toEqual(['hallway', 'rooftop', 'start'])
    expect(r.unreachable).toEqual(['orphan'])
  })

  it('检测悬空目标(指向不存在的 id)', () => {
    const ast = script([scene('start', [choice('坏链接', 'ghost')])])
    const r = analyzeReachability(ast)
    expect(r.danglingTargets).toEqual([{ from: 'start', target: 'ghost' }])
  })

  it('空剧本 → entry=null,全空', () => {
    const r = analyzeReachability(script([]))
    expect(r.entry).toBeNull()
    expect(r.reachable).toEqual([])
    expect(r.unreachable).toEqual([])
    expect(r.danglingTargets).toEqual([])
  })

  it('无出边的死胡同场景仍算可达(被指向即可达)', () => {
    const ast = script([scene('start', [choice('结束', 'ending')]), scene('ending', [])])
    const r = analyzeReachability(ast)
    expect(r.reachable.sort()).toEqual(['ending', 'start'])
    expect(r.unreachable).toEqual([])
  })
})
