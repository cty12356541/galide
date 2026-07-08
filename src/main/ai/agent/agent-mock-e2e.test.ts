import { describe, it, expect } from 'vitest'
import { createFsFromVolume, Volume } from 'memfs'
import * as z from 'zod/v4'
import { runAgent, type AgentStep, type AgentGit } from './agent-loop.js'
import { createDefaultToolRegistry } from './create-default-registry.js'
import { createToolRegistry, defineTool } from './tool-registry.js'
import { scriptTools } from './tools/script-tools.js'
import { createAgentRuntime } from './agent-runtime.js'
import { createAutonomyGate } from './autonomy-gate.js'
import {
  EXAMPLE_ADD_DIALOGUE,
  stagesFromAgentSteps,
  stepsCoverExampleWalk,
  walkStages
} from './topology-dag.js'
import { TOPOLOGIES } from './topology.js'
import type { LlmAdapter, LlmChatRequest, LlmChatResponse } from './llm-adapter.js'
import type { ToolFs } from './types.js'

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

const makeDualProjectFs = (): {
  runtime: ReturnType<typeof createAgentRuntime>
  fs: ToolFs
  read: (root: string, f: string) => string
} => {
  const vol = Volume.fromJSON({
    '/old/scripts/chapter1.gal': '## intro\n背景: classroom\n',
    '/new/scripts/chapter1.gal': '## intro\n背景: classroom\n'
  })
  const mfs = createFsFromVolume(vol)
  const fs: ToolFs = {
    readFile: (p) => mfs.promises.readFile(p, 'utf-8') as Promise<string>,
    writeFile: (p, c) => mfs.promises.writeFile(p, c) as Promise<void>,
    readdir: (p) => mfs.promises.readdir(p) as Promise<string[]>
  }
  const runtime = createAgentRuntime({ projectPath: '/old' })
  return {
    runtime,
    fs,
    read: (root, f) => mfs.readFileSync(`${root}/scripts/${f}`, 'utf-8') as string
  }
}

const makeProject = (): {
  runtime: ReturnType<typeof createAgentRuntime>
  fs: ToolFs
  read: (f: string) => string
} => {
  const { runtime, fs, read } = makeDualProjectFs()
  return {
    runtime,
    fs,
    read: (f) => read('/old', f)
  }
}

describe('agent — mock 端到端(DAG 路径: add_dialogue 演示)', () => {
  it('沿 DAG fan-in→Execute↔Tools→双轨Critic→Done,非单链 Plan→Exec→Critic', async () => {
    const { runtime, fs, read } = makeProject()
    const toolContext = runtime.createToolContext({ fs })
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
        toolContext,
        loadScriptAst: async () => {
          const src = read('chapter1.gal')
          const { parse } = await import('../../../shared/dsl/parser.js')
          const r = parse(src)
          return r.ok ? r.value : null
        },
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
    const criticSteps = steps.filter((s) => s.type === 'critic')
    expect(criticSteps.length).toBeGreaterThanOrEqual(2)
    expect(criticSteps.some((s) => s.type === 'critic' && s.report.kind === 'deterministic')).toBe(true)
    expect(criticSteps.some((s) => s.type === 'critic' && s.report.kind === 'llm')).toBe(true)
    expect(steps.some((s) => s.type === 'done')).toBe(true)

    expect(stepsCoverExampleWalk(steps, EXAMPLE_ADD_DIALOGUE)).toBe(true)
    const visited = stagesFromAgentSteps(steps)
    expect(visited).toContain('plan')
    expect(visited).toContain('gate')
    expect(visited).toContain('tools')
    expect(visited).toContain('critic_det')
    expect(visited).toContain('critic_llm')
    expect(visited.filter((s) => s === 'execute').length).toBeGreaterThanOrEqual(1)
    expect(walkStages(EXAMPLE_ADD_DIALOGUE)).toContain('critic_llm')

    const criticCall = llm.calls[3]
    const criticContent = criticCall?.messages[0]?.content ?? ''
    expect(criticContent).toContain('本轮执行记录')
    expect(criticContent).toContain('add_dialogue')
    expect(criticContent).toContain('成功')
  })
})

describe('agent — switchProject 后工具写入新项目', () => {
  it('open_project → add_dialogue 写入 /new 而非 /old', async () => {
    const { runtime, fs, read } = makeDualProjectFs()
    const openProject = defineTool({
      name: 'open_project',
      description: 'test open',
      risk: 'destructive',
      domain: 'disk',
      schema: z.object({ projectPath: z.string().min(1) }),
      handler: async (args, ctx) => {
        await ctx.switchProject!({
          projectPath: args.projectPath,
          manifest: { name: 'New' } as never
        })
        return { ok: true, content: `已打开 ${args.projectPath}` }
      }
    })
    const tools = createToolRegistry([...scriptTools, openProject])
    const toolContext = runtime.createToolContext({ fs })
    const llm = fakeLlm([
      {
        text: '',
        toolCalls: [{ id: 'o1', name: 'open_project', args: { projectPath: '/new' } }]
      },
      {
        text: '',
        toolCalls: [
          {
            id: 'c1',
            name: 'add_dialogue',
            args: { fileName: 'chapter1.gal', sceneId: 'intro', character: '小雪', text: '切换后' }
          }
        ]
      },
      { text: '完成', toolCalls: [] }
    ])

    const result = await runAgent(
      { goal: '打开新项目并加对白', system: '你是 agent' },
      {
        llm,
        tools,
        git: fakeGit(),
        gate: createAutonomyGate('autonomous'),
        topology: TOPOLOGIES.singleReact,
        toolContext,
        onStep: () => undefined
      }
    )

    expect(result.status).toBe('done')
    expect(read('/old', 'chapter1.gal')).not.toContain('切换后')
    expect(read('/new', 'chapter1.gal')).toContain('小雪: "切换后"')
    expect(toolContext.projectPath).toBe('/new')
  })
})
