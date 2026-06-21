/**
 * topology 单测 — 三档拓扑配置 + 结构化计划解析
 */
import { describe, it, expect } from 'vitest'
import { TOPOLOGIES, DEFAULT_TOPOLOGY, planFromText } from './topology.js'

describe('TOPOLOGIES 三档配置', () => {
  it('singleReact:无 planner、无 critic', () => {
    expect(TOPOLOGIES.singleReact.usePlanner).toBe(false)
    expect(TOPOLOGIES.singleReact.criticKind).toBe('none')
  })
  it('litePlanExecute(默认):planner + 确定性 critic', () => {
    expect(DEFAULT_TOPOLOGY).toBe('litePlanExecute')
    expect(TOPOLOGIES.litePlanExecute.usePlanner).toBe(true)
    expect(TOPOLOGIES.litePlanExecute.criticKind).toBe('deterministic')
  })
  it('planExecuteCritic:planner + LLM critic', () => {
    expect(TOPOLOGIES.planExecuteCritic.usePlanner).toBe(true)
    expect(TOPOLOGIES.planExecuteCritic.criticKind).toBe('llm')
  })
})

describe('planFromText — 结构化可编辑计划', () => {
  it('解析编号列表', () => {
    const plan = planFromText('1. 创建场景\n2. 添加对白\n3. 检查可达性')
    expect(plan.steps).toHaveLength(3)
    expect(plan.steps[0]).toEqual({ index: 1, description: '创建场景' })
    expect(plan.steps[2]?.description).toBe('检查可达性')
  })

  it('解析无序列表(- / *)', () => {
    const plan = planFromText('- 第一步\n* 第二步')
    expect(plan.steps.map((s) => s.description)).toEqual(['第一步', '第二步'])
  })

  it('无可识别条目 → 整段作为单步', () => {
    const plan = planFromText('直接做这件事')
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]?.description).toBe('直接做这件事')
  })

  it('保留原文 raw', () => {
    expect(planFromText('1. a').raw).toBe('1. a')
  })
})
