import { describe, it, expect } from 'vitest'
import { createFsFromVolume, Volume } from 'memfs'
import { runAgent, type AgentStep, type AgentGit } from './agent-loop.js'
import { createDefaultToolRegistry } from './create-default-registry.js'
import { createAutonomyGate } from './autonomy-gate.js'
import { TOPOLOGIES } from './topology.js'
import type { LlmAdapter, LlmChatRequest, LlmChatResponse } from './llm-adapter.js'
import type { ToolContext, ToolFs } from './types.js'

const fakeLlm = (responses: LlmChatResponse[]): LlmAdapter & { calls: LlmChatRequest[] } => {
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

const fakeGit = (): AgentGit & { events: string[] } => {
  const events: string[] = []
  return {
    events,
    snapshot: async (label: string) => {
      events.push(`snapshot:${label}`)
      return { ok: true, ref: 'snap-mock' }
    },
    rollback: async (ref?: string) => {
      events.push(`rollback:${ref ?? ''}`)
      return { ok: true }
    }
  }
}

const makeProject = (): { ctx: ToolContext; fs: ToolFs; read: (f: string) => string } => {
  const vol = Volume.fromJSON({ '/proj/scripts/chapter1.gal': '## intro\n背景: classroom\n' })
  const mfs = createFsFromVolume(vol)
  const fs: ToolFs = {
    readFile: (p) => mfs.promises.readFile(p, 'utf-8') as Promise<string>,
    writeFile: (p, c) => mfs.promises.writeFile(p, c) as Promise<void>,
    readdir: (p) => mfs.promises.readdir(p) as Promise<string[]>
  }
  return {
    ctx: { projectPath: '/proj', fs },
    fs,
    read: (f) => mfs.readFileSync(`/proj/scripts/${f}`, 'utf-8') as string
  }
}

describe('agent — mock 端到端 critic 闭环', () => {
  it('planner→executor(真实改盘)→critic(含执行摘要)→done', async () => {
    const { ctx, read } = makeProject()
    const llm = fakeLlm([
      { text: '1. 给小雪加一句对白', toolCalls: [] },
      {
        text: '好的,我来加对白',
        toolCalls: [
          {
            id: 'c1',
            name: 'add_dialogue',
            args: { fileName: 'chapter1.gal', sceneId: 'intro', character: '小雪', text: '你好' }
          }
        ]
      },
      { text: '已完成', toolCalls: [] },
      { text: '审查通过:已在 intro 场景加入小雪对白,目标达成', toolCalls: [] }
    ])
    const git = fakeGit()
    const steps: AgentStep[] = []

    const result = await runAgent(
      { goal: '给小雪加一句对白', system: '你是 agent' },
      {
        llm,
        tools: createDefaultToolRegistry(),
        git,
        gate: createAutonomyGate('autonomous'),
        topology: TOPOLOGIES.planExecuteCritic,
        toolContext: ctx,
        onStep: (s) => steps.push(s)
      }
    )

    expect(result.status).toBe('done')
    expect(result.rolledBack).toBeFalsy()
    expect(git.events.some((e) => e.startsWith('rollback'))).toBe(false)

    const out = read('chapter1.gal')
    expect(out).toContain('小雪: "你好"')

    expect(steps.some((s) => s.type === 'plan')).toBe(true)
    expect(steps.some((s) => s.type === 'tool_call')).toBe(true)
    expect(steps.some((s) => s.type === 'tool_result')).toBe(true)
    const criticStep = steps.find((s) => s.type === 'critic')
    expect(criticStep?.type === 'critic' && criticStep.report.kind).toBe('llm')
    expect(steps.some((s) => s.type === 'done')).toBe(true)

    const criticCall = llm.calls[3]
    const criticContent = criticCall?.messages[0]?.content ?? ''
    expect(criticContent).toContain('本轮执行记录')
    expect(criticContent).toContain('add_dialogue')
    expect(criticContent).toContain('成功')
  })
})
