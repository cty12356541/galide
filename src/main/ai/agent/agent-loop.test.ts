/**
 * agent-loop 单测 — 显式状态机(依赖注入)
 *
 * 用 FakeLlm(预设 ToolCall 序列)+ FakeTool(记录调用)驱动状态机,完全不触网。
 * 覆盖:Planning→Gate→Executing→Observing→Done、gate 确认暂停、工具抛错继续、
 *       取消→回滚、LLM 抛错→回滚、拓扑 stage 编排。
 */
import { describe, it, expect, vi } from 'vitest'
import * as z from 'zod/v4'
import { runAgent, type AgentGit, type AgentStep } from './agent-loop.js'
import { createToolRegistry, defineTool } from './tool-registry.js'
import { createAutonomyGate } from './autonomy-gate.js'
import { TOPOLOGIES } from './topology.js'
import type { LlmAdapter, LlmChatRequest, LlmChatResponse } from './llm-adapter.js'
import type { ToolContext, ToolRisk } from './types.js'
import type { ScriptNode } from '../../../shared/dsl/types.js'

const toolContext: ToolContext = {
  projectPath: '/proj',
  fs: { readFile: async () => '', writeFile: async () => undefined, readdir: async () => [] }
}

const fakeLlm = (
  responses: LlmChatResponse[]
): LlmAdapter & { calls: LlmChatRequest[] } => {
  const calls: LlmChatRequest[] = []
  let i = 0
  return {
    supportsTools: true,
    calls,
    chat: async (req: LlmChatRequest): Promise<LlmChatResponse> => {
      calls.push(req)
      return responses[i++] ?? { text: '完成', toolCalls: [] }
    }
  }
}

const throwingLlm = (): LlmAdapter => ({
  supportsTools: true,
  chat: async () => {
    throw new Error('network boom')
  }
})

const fakeGit = (): AgentGit & { events: string[] } => {
  const events: string[] = []
  return {
    events,
    snapshot: async (label: string) => {
      events.push(`snapshot:${label}`)
      return { ok: true, ref: 'snap1' }
    },
    rollback: async (ref?: string) => {
      events.push(`rollback:${ref ?? ''}`)
      return { ok: true }
    }
  }
}

const makeTools = (
  risk: ToolRisk = 'safeWrite',
  result: { ok: boolean; content: string } = { ok: true, content: 'did it' }
): { registry: ReturnType<typeof createToolRegistry>; calls: unknown[] } => {
  const calls: unknown[] = []
  const tool = defineTool({
    name: 'do_thing',
    description: '做一件事',
    risk,
    domain: 'disk',
    schema: z.object({ x: z.string().optional() }),
    handler: async (args) => {
      calls.push(args)
      return result
    }
  })
  return { registry: createToolRegistry([tool]), calls }
}

const call = (name: string, args: unknown = {}): LlmChatResponse => ({
  text: '',
  toolCalls: [{ id: 'c1', name, args }]
})

const baseReq = { goal: '加一条对白', system: '你是 agent' }

describe('agent-loop — 状态机基本流', () => {
  it('singleReact:工具调用 → observation → done', async () => {
    const llm = fakeLlm([call('do_thing'), { text: '搞定', toolCalls: [] }])
    const { registry, calls } = makeTools('read')
    const git = fakeGit()
    const steps: AgentStep[] = []
    const result = await runAgent(baseReq, {
      llm,
      tools: registry,
      git,
      gate: createAutonomyGate('autonomous'),
      topology: TOPOLOGIES.singleReact,
      toolContext,
      onStep: (s) => steps.push(s)
    })
    expect(result.status).toBe('done')
    expect(result.finalText).toBe('搞定')
    expect(calls).toHaveLength(1)
    expect(steps.some((s) => s.type === 'tool_call')).toBe(true)
    expect(steps.some((s) => s.type === 'tool_result')).toBe(true)
    expect(steps.some((s) => s.type === 'plan')).toBe(false) // singleReact 无 planner
    expect(git.events).toContain('snapshot:agent: 加一条对白')
    expect(git.events.some((e) => e.startsWith('rollback'))).toBe(false)
  })

  it('litePlanExecute:跑 planner + 确定性 critic', async () => {
    const llm = fakeLlm([
      { text: '1. 创建场景\n2. 加对白', toolCalls: [] }, // planner
      call('do_thing'), // executor step 1
      { text: '完成', toolCalls: [] } // executor step 2 (no tools → done)
    ])
    const { registry } = makeTools('safeWrite')
    const ast: ScriptNode = {
      type: 'script',
      line: 1,
      column: 1,
      errors: [],
      children: [{ type: 'scene', id: 'a', line: 0, column: 1, children: [] }]
    }
    const steps: AgentStep[] = []
    const result = await runAgent(baseReq, {
      llm,
      tools: registry,
      git: fakeGit(),
      gate: createAutonomyGate('autonomous'),
      topology: TOPOLOGIES.litePlanExecute,
      toolContext,
      loadScriptAst: async () => ast,
      onStep: (s) => steps.push(s)
    })
    expect(result.status).toBe('done')
    const planStep = steps.find((s) => s.type === 'plan')
    expect(planStep).toBeDefined()
    const criticStep = steps.find((s) => s.type === 'critic')
    expect(criticStep?.type === 'critic' && criticStep.report.kind).toBe('deterministic')
  })

  it('planExecuteCritic:critic 走 LLM', async () => {
    const llm = fakeLlm([
      { text: '1. 干活', toolCalls: [] }, // planner
      { text: '完成', toolCalls: [] }, // executor done immediately
      { text: '审查:看起来不错', toolCalls: [] } // llm critic
    ])
    const { registry } = makeTools()
    const steps: AgentStep[] = []
    const result = await runAgent(baseReq, {
      llm,
      tools: registry,
      git: fakeGit(),
      gate: createAutonomyGate('autonomous'),
      topology: TOPOLOGIES.planExecuteCritic,
      toolContext,
      onStep: (s) => steps.push(s)
    })
    expect(result.status).toBe('done')
    const criticStep = steps.find((s) => s.type === 'critic')
    expect(criticStep?.type === 'critic' && criticStep.report.kind).toBe('llm')
  })
})

describe('agent-loop — autonomy gate', () => {
  it('copilot + safeWrite:暂停确认,拒绝则不执行工具', async () => {
    const llm = fakeLlm([call('do_thing'), { text: '完成', toolCalls: [] }])
    const { registry, calls } = makeTools('safeWrite')
    const requestConfirm = vi.fn(async () => false)
    const steps: AgentStep[] = []
    const result = await runAgent(baseReq, {
      llm,
      tools: registry,
      git: fakeGit(),
      gate: createAutonomyGate('copilot'),
      topology: TOPOLOGIES.singleReact,
      toolContext,
      requestConfirm,
      onStep: (s) => steps.push(s)
    })
    expect(requestConfirm).toHaveBeenCalled()
    expect(calls).toHaveLength(0) // 工具未执行
    expect(steps.some((s) => s.type === 'awaiting_confirm')).toBe(true)
    expect(result.status).toBe('done')
  })

  it('copilot + safeWrite:确认通过则执行工具', async () => {
    const llm = fakeLlm([call('do_thing'), { text: '完成', toolCalls: [] }])
    const { registry, calls } = makeTools('safeWrite')
    const requestConfirm = vi.fn(async () => true)
    const result = await runAgent(baseReq, {
      llm,
      tools: registry,
      git: fakeGit(),
      gate: createAutonomyGate('copilot'),
      topology: TOPOLOGIES.singleReact,
      toolContext,
      requestConfirm
    })
   expect(calls).toHaveLength(1)
   expect(result.status).toBe('done')
 })

  it('copilot + previewable:确认请求携带 before/after diff', async () => {
    const previewable = defineTool({
      name: 'write_thing',
      description: '写文件',
      risk: 'safeWrite',
      domain: 'disk',
      previewable: true,
      schema: z.object({}),
      handler: async (_args, ctx) => {
        await ctx.fs.writeFile('/proj/scripts/x.gal', '## new\n阳: "hi"\n')
        return { ok: true, content: 'wrote' }
      }
    })
    type ConfirmReq = { call: unknown; risk: string; diff?: { before: string; after: string } }
    const llm = fakeLlm([call('write_thing'), { text: '完成', toolCalls: [] }])
    const requestConfirm = vi.fn(async (_req: ConfirmReq) => false)
    await runAgent(baseReq, {
      llm,
      tools: createToolRegistry([previewable]),
      git: fakeGit(),
      gate: createAutonomyGate('copilot'),
      topology: TOPOLOGIES.singleReact,
      toolContext,
      requestConfirm
    })
    expect(requestConfirm).toHaveBeenCalled()
    const req = requestConfirm.mock.calls[0]?.[0] as ConfirmReq
    expect(req.diff).toBeDefined()
    expect(req.diff?.after).toContain('## new')
  })
})

describe('agent-loop — 错误与取消分支', () => {
  it('工具返回 ok=false → 作为 observation 继续,不回滚', async () => {
    const llm = fakeLlm([call('do_thing'), { text: '改用别的办法,完成', toolCalls: [] }])
    const { registry } = makeTools('read', { ok: false, content: '工具失败了' })
    const git = fakeGit()
    const result = await runAgent(baseReq, {
      llm,
      tools: registry,
      git,
      gate: createAutonomyGate('autonomous'),
      topology: TOPOLOGIES.singleReact,
      toolContext
    })
    expect(result.status).toBe('done')
    expect(git.events.some((e) => e.startsWith('rollback'))).toBe(false)
  })

  it('LLM 抛错 → status=error 且 git 回滚', async () => {
    const { registry } = makeTools()
    const git = fakeGit()
    const result = await runAgent(baseReq, {
      llm: throwingLlm(),
      tools: registry,
      git,
      gate: createAutonomyGate('autonomous'),
      topology: TOPOLOGIES.singleReact,
      toolContext
    })
    expect(result.status).toBe('error')
    expect(result.rolledBack).toBe(true)
    expect(git.events.some((e) => e.startsWith('rollback'))).toBe(true)
  })

  it('signal 已 abort → status=cancelled 且回滚', async () => {
    const llm = fakeLlm([call('do_thing'), { text: '完成', toolCalls: [] }])
    const { registry, calls } = makeTools()
    const git = fakeGit()
    const controller = new AbortController()
    controller.abort()
    const result = await runAgent(baseReq, {
      llm,
      tools: registry,
      git,
      gate: createAutonomyGate('autonomous'),
      topology: TOPOLOGIES.singleReact,
      toolContext,
      signal: controller.signal
    })
    expect(result.status).toBe('cancelled')
    expect(calls).toHaveLength(0)
    expect(git.events.some((e) => e.startsWith('rollback'))).toBe(true)
  })

  it('maxSteps 用尽未完成 → error + 回滚', async () => {
    // 永远返回工具调用,触发上限
    const llm = fakeLlm(Array.from({ length: 20 }, () => call('do_thing')))
    const { registry } = makeTools('read')
    const git = fakeGit()
    const result = await runAgent(baseReq, {
      llm,
      tools: registry,
      git,
      gate: createAutonomyGate('autonomous'),
      topology: TOPOLOGIES.singleReact,
      toolContext,
      maxSteps: 3
    })
    expect(result.status).toBe('error')
    expect(result.error).toContain('MAX_STEPS')
    expect(git.events.some((e) => e.startsWith('rollback'))).toBe(true)
  })

  it('snapshot 失败 → 中止且不调用 rollback', async () => {
    const llm = fakeLlm([{ text: '完成', toolCalls: [] }])
    const { registry } = makeTools()
    const git: AgentGit & { events: string[] } = {
      events: [],
      snapshot: async () => ({ ok: false, error: 'not a git repo' }),
      rollback: async (ref) => {
        git.events.push(`rollback:${ref ?? ''}`)
        return { ok: true }
      }
    }
    const result = await runAgent(baseReq, {
      llm,
      tools: registry,
      git,
      gate: createAutonomyGate('autonomous'),
      topology: TOPOLOGIES.singleReact,
      toolContext
    })
    expect(result.status).toBe('error')
    expect(result.error).toContain('not a git repo')
    expect(result.rolledBack).toBe(false)
    expect(git.events.some((e) => e.startsWith('rollback'))).toBe(false)
    expect(llm.calls).toHaveLength(0)
  })

  it('rollback 使用 snapshot ref,不会 reset 到 HEAD', async () => {
    const { registry } = makeTools()
    const git = fakeGit()
    await runAgent(baseReq, {
      llm: throwingLlm(),
      tools: registry,
      git,
      gate: createAutonomyGate('autonomous'),
      topology: TOPOLOGIES.singleReact,
      toolContext
    })
    expect(git.events).toContain('rollback:snap1')
    expect(git.events.some((e) => e === 'rollback:HEAD' || e === 'rollback:')).toBe(false)
  })

  it('signal 传入 llm.chat', async () => {
    const controller = new AbortController()
    const llm = fakeLlm([{ text: '完成', toolCalls: [] }])
    const { registry } = makeTools()
    await runAgent(baseReq, {
      llm,
      tools: registry,
      git: fakeGit(),
      gate: createAutonomyGate('autonomous'),
      topology: TOPOLOGIES.singleReact,
      toolContext,
      signal: controller.signal
    })
    expect(llm.calls.length).toBeGreaterThan(0)
    expect(llm.calls.every((c) => c.signal === controller.signal)).toBe(true)
  })
})
