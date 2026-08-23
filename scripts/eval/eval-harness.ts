/**
 * eval-harness — 真实模型 agent eval 的支撑件
 *
 * - EvalLlm: 用环境变量凭证直接构造 OpenAI / Anthropic SDK adapter
 *   (与 app 内 key-store 解耦;复用 LlmAdapter 接口)
 * - fakeGit: agent-loop 的 git 协议 stub(记录 rollback)
 * - judge*: 每个任务的确定性判定(merged AST + brain)
 */
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { mkdtemp, cp, readFile, writeFile, readdir as fsReaddir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LlmAdapter, LlmChatRequest, LlmChatResponse } from '../../src/main/ai/agent/llm-adapter.js'
import type { AgentGit } from '../../src/main/ai/agent/agent-loop.js'
import type { ToolCall } from '../../src/main/ai/agent/types.js'
import { parseProjectScripts } from '../../src/main/export/parse-project-scripts.js'
import { mergeScriptAsts } from '../../src/shared/dsl/merge-scripts.js'
import { analyzeReachability, hasReachabilityIssues } from '../../src/main/ai/agent/decision-tree.js'
import { readBrain } from '../../src/main/brain/brain-store.js'
import { scriptsDirAbs } from '../../src/shared/project-layout.js'

export type EvalConfig = {
  provider: 'openai' | 'claude'
  model: string
  baseUrl?: string
  apiKey: string
}

export const readEvalConfig = (): EvalConfig | null => {
  const provider = process.env.GALIDE_EVAL_PROVIDER
  const model = process.env.GALIDE_EVAL_MODEL
  if (!provider || !model) return null
  if (provider !== 'openai' && provider !== 'claude') return null
  const apiKey =
    provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  return { provider, model, apiKey, baseUrl: process.env.GALIDE_EVAL_BASEURL }
}

/** 真实模型 LlmAdapter;记录 usage 与请求计数 */
export const createEvalLlm = (cfg: EvalConfig): LlmAdapter & { usage: { prompt: number; completion: number }; calls: number } => {
  const state = { prompt: 0, completion: 0, calls: 0 }
  const toolCallsFromOpenAi = (raw: unknown): ToolCall[] => {
    const msg = (raw ?? {}) as { tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> }
    return (msg.tool_calls ?? []).map((tc, i) => ({
      id: tc.id ?? `call-${i}`,
      name: tc.function?.name ?? '',
      args: safeParse(tc.function?.arguments ?? '{}')
    }))
  }
  if (cfg.provider === 'openai') {
    const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl })
    return {
      supportsTools: true,
      get usage() {
        return state
      },
      get calls() {
        return state.calls
      },
      chat: async (req: LlmChatRequest): Promise<LlmChatResponse> => {
        state.calls++
        const resp = await client.chat.completions.create({
          model: cfg.model,
          messages: [
            { role: 'system', content: req.system },
            ...req.messages.map((m) => ({ role: m.role, content: m.content }))
          ],
          tools:
            req.tools.length > 0
              ? (req.tools.map((t) => ({
                  type: 'function',
                  function: { name: t.name, description: t.description, parameters: t.parameters }
                })) as never)
              : undefined
        })
        const choice = resp.choices[0]?.message
        state.prompt += resp.usage?.prompt_tokens ?? 0
        state.completion += resp.usage?.completion_tokens ?? 0
        return { text: choice?.content ?? '', toolCalls: toolCallsFromOpenAi(choice) }
      }
    }
  }
  const client = new Anthropic({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl })
  return {
    supportsTools: true,
    get usage() {
      return state
    },
    get calls() {
      return state.calls
    },
    chat: async (req: LlmChatRequest): Promise<LlmChatResponse> => {
      state.calls++
      const resp = await client.messages.create({
        model: cfg.model,
        max_tokens: 4096,
        system: req.system,
        messages: req.messages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        })),
        tools:
          req.tools.length > 0
            ? (req.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters as never
              })) as never)
            : undefined
      })
      let text = ''
      const toolCalls: ToolCall[] = []
      for (const block of resp.content) {
        if (block.type === 'text') text += block.text
        else if (block.type === 'tool_use') {
          toolCalls.push({ id: block.id, name: block.name, args: (block.input ?? {}) as unknown })
        }
      }
      state.prompt += resp.usage?.input_tokens ?? 0
      state.completion += resp.usage?.output_tokens ?? 0
      return { text, toolCalls }
    }
  }
}

const safeParse = (s: string): unknown => {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}

export const createEvalGit = (): AgentGit & { rollbacks: number } => {
  const git = {
    rollbacks: 0,
    snapshot: async () => ({ ok: true, ref: `eval-snap-${Math.random().toString(36).slice(2)}` }),
    rollback: async () => {
      git.rollbacks++
      return { ok: true }
    }
  }
  return git
}

/** 从 fixture 目录复制出一次性运行目录 */
export const materializeFixture = async (fixtureDir: string): Promise<string> => {
  const runDir = await mkdtemp(join(tmpdir(), 'galide-eval-'))
  await cp(fixtureDir, runDir, { recursive: true })
  return runDir
}

export const evalNodeFs = {
  readFile: (p: string) => readFile(p, 'utf-8'),
  writeFile: async (p: string, c: string) => {
    await writeFile(p, c, 'utf-8')
  },
  readdir: (p: string) => fsReaddir(p) as Promise<string[]>
}

// ---------------- 判定(judge) ----------------

export const loadMergedAst = async (projectPath: string) => {
  const { asts, failures } = await parseProjectScripts(scriptsDirAbs(projectPath), evalNodeFs)
  return {
    ast: asts.length > 0 ? mergeScriptAsts(asts) : null,
    failures,
    reachability: asts.length > 0 ? analyzeReachability(mergeScriptAsts(asts)) : null
  }
}

export type JudgeResult = { pass: boolean; detail: string }

export const judgeReachabilityClean = async (projectPath: string): Promise<JudgeResult> => {
  const { ast, failures, reachability } = await loadMergedAst(projectPath)
  if (failures.length > 0) return { pass: false, detail: `parse failures: ${failures.map((f) => f.file).join(',')}` }
  if (!ast || !reachability) return { pass: false, detail: 'no scripts' }
  if (hasReachabilityIssues(reachability)) {
    return {
      pass: false,
      detail: `unreachable=${reachability.unreachable.join(',')} dangling=${reachability.danglingTargets.map((d) => d.target).join(',')}`
    }
  }
  return { pass: true, detail: 'reachability clean' }
}

export const judgeSceneExists = (projectPath: string, sceneId: string) => async (): Promise<JudgeResult> => {
  const { reachability } = await loadMergedAst(projectPath)
  if (reachability?.reachable.includes(sceneId)) return { pass: true, detail: `scene ${sceneId} reachable` }
  return { pass: false, detail: `scene ${sceneId} missing or unreachable` }
}

export const judgeBrainHasForeshadowing = async (projectPath: string): Promise<JudgeResult> => {
  const r = await readBrain(projectPath, evalNodeFs)
  const planted = r.brain.foreshadowings.filter((f) => f.status === 'planted')
  if (planted.length > 0) return { pass: true, detail: `${planted.length} planted foreshadowing(s)` }
  return { pass: false, detail: 'no planted foreshadowing in project-brain.json' }
}
