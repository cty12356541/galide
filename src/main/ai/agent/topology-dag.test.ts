/**
 * topology-dag 单测 — DAG 边集与拓扑子图
 */
import { describe, it, expect } from 'vitest'
import {
  AGENT_STAGE_EDGES,
  activeStagesFor,
  EXAMPLE_ADD_DIALOGUE,
  EXAMPLE_CRITIC_FIX_RETRY,
  forwardEdgesFor,
  retryEdgesFor,
  stageHintsFromAgentStep,
  topologyFor,
  walkStages
} from './topology-dag.js'
import { TOPOLOGIES } from './topology.js'

describe('AGENT_STAGE_EDGES', () => {
  it('含 fan-out: execute → gate → tools', () => {
    expect(AGENT_STAGE_EDGES.some((e) => e.from === 'execute' && e.to === 'gate')).toBe(true)
    expect(AGENT_STAGE_EDGES.some((e) => e.from === 'gate' && e.to === 'tools')).toBe(true)
    expect(AGENT_STAGE_EDGES.some((e) => e.from === 'tools' && e.to === 'execute')).toBe(true)
  })

  it('含 fan-in: context/plan → execute', () => {
    expect(AGENT_STAGE_EDGES.some((e) => e.from === 'context' && e.to === 'execute')).toBe(true)
    expect(AGENT_STAGE_EDGES.some((e) => e.from === 'plan' && e.to === 'execute')).toBe(true)
  })

  it('retry 边仅 replan/critic → execute', () => {
    const retries = AGENT_STAGE_EDGES.filter((e) => e.kind === 'retry')
    expect(retries.every((e) => e.to === 'execute')).toBe(true)
    expect(retries.map((e) => e.from).sort()).toEqual(['critic_det', 'replan'])
  })
})

describe('activeStagesFor', () => {
  it('singleReact:无 plan/replan/critic', () => {
    const stages = activeStagesFor(TOPOLOGIES.singleReact)
    expect(stages).not.toContain('plan')
    expect(stages).not.toContain('critic_det')
    expect(stages).toContain('execute')
    expect(stages).toContain('tools')
  })

  it('litePlanExecute:plan + critic_det + replan', () => {
    const stages = activeStagesFor(TOPOLOGIES.litePlanExecute)
    expect(stages).toContain('plan')
    expect(stages).toContain('critic_det')
    expect(stages).toContain('replan')
    expect(stages).not.toContain('critic_llm')
  })

  it('planExecuteCritic:双轨 critic', () => {
    const stages = activeStagesFor(TOPOLOGIES.planExecuteCritic)
    expect(stages).toContain('critic_det')
    expect(stages).toContain('critic_llm')
  })
})

describe('forwardEdgesFor / retryEdgesFor', () => {
  it('litePlanExecute 含 critic_det → done forward 边', () => {
    const fwd = forwardEdgesFor(TOPOLOGIES.litePlanExecute)
    expect(fwd.some((e) => e.from === 'critic_det' && e.to === 'done')).toBe(true)
  })

  it('litePlanExecute 含 critic_det → execute retry 边', () => {
    const retry = retryEdgesFor(TOPOLOGIES.litePlanExecute)
    expect(retry.some((e) => e.from === 'critic_det' && e.to === 'execute')).toBe(true)
  })

  it('singleReact 无 retry 边', () => {
    expect(retryEdgesFor(TOPOLOGIES.singleReact)).toHaveLength(0)
  })

  it('topologyFor 与 TOPOLOGIES 一致', () => {
    expect(topologyFor('litePlanExecute')).toBe(TOPOLOGIES.litePlanExecute)
  })
})

describe('AgentDagExample 演示路径', () => {
  it('add_dialogue: walk 含 fan-out 双轨 critic', () => {
    const stages = walkStages(EXAMPLE_ADD_DIALOGUE)
    expect(stages).toContain('plan')
    expect(stages).toContain('critic_det')
    expect(stages).toContain('critic_llm')
    expect(stages).toContain('done')
    const retries = EXAMPLE_ADD_DIALOGUE.walk.filter((h) => h.via?.kind === 'retry')
    expect(retries).toHaveLength(0)
  })

  it('critic_fix_retry: walk 含 retry 边 critic_det→execute', () => {
    const retries = EXAMPLE_CRITIC_FIX_RETRY.walk.filter((h) => h.via?.kind === 'retry')
    expect(retries).toHaveLength(1)
    expect(retries[0]?.via?.from).toBe('critic_det')
    expect(retries[0]?.via?.to).toBe('execute')
  })

  it('stageHintsFromAgentStep: tool_call 映射 gate+tools', () => {
    expect(stageHintsFromAgentStep({ type: 'tool_call' })).toEqual(['gate', 'tools'])
  })
})
