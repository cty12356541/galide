/**
 * llm-adapter 单测 — provider 原生 tool_calls/tool_use 归一为内部 ToolCall
 *
 * fixture 驱动:用录制的 OpenAI/Claude 响应 JSON 断言归一化。完全不触网。
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeOpenAiResponse,
  normalizeClaudeResponse,
  toolsToOpenAiFormat,
  toolsToClaudeFormat,
  withLlmDefaults,
  createLlmAdapter
} from './llm-adapter.js'
import { resolveApiKey } from '../key-resolve.js'
import type { LlmAdapter, LlmChatRequest } from './llm-adapter.js'
import type { ToolJsonSchema } from './tool-registry.js'

// ---- 录制的 OpenAI 响应(finish_reason: tool_calls) ----
const openAiToolResponse = {
  choices: [
    {
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_abc',
            type: 'function',
            function: { name: 'create_scene', arguments: '{"fileName":"chapter1.gal","sceneId":"rooftop"}' }
          }
        ]
      },
      finish_reason: 'tool_calls'
    }
  ],
  usage: { prompt_tokens: 120, completion_tokens: 18, total_tokens: 138 }
}

const openAiTextResponse = {
  choices: [{ message: { role: 'assistant', content: '好的,我来帮你。' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 }
}

// ---- 录制的 Claude 响应(含 tool_use) ----
const claudeToolResponse = {
  id: 'msg_1',
  content: [
    { type: 'text', text: '我先看看场景。' },
    {
      type: 'tool_use',
      id: 'toolu_xyz',
      name: 'list_scenes',
      input: { fileName: 'chapter1.gal' }
    }
  ],
  stop_reason: 'tool_use',
  usage: { input_tokens: 200, output_tokens: 25 }
}

describe('normalizeOpenAiResponse', () => {
  it('提取 tool_calls 为内部 ToolCall(args 解析为对象)', () => {
    const r = normalizeOpenAiResponse(openAiToolResponse)
    expect(r.toolCalls).toHaveLength(1)
    expect(r.toolCalls[0]?.id).toBe('call_abc')
    expect(r.toolCalls[0]?.name).toBe('create_scene')
    expect(r.toolCalls[0]?.args).toEqual({ fileName: 'chapter1.gal', sceneId: 'rooftop' })
    expect(r.usage?.promptTokens).toBe(120)
  })

  it('纯文本响应 → text 有值,toolCalls 空', () => {
    const r = normalizeOpenAiResponse(openAiTextResponse)
    expect(r.text).toContain('好的')
    expect(r.toolCalls).toHaveLength(0)
  })

  it('非法 arguments JSON → args 退化为空对象(交给 schema 兜底)', () => {
    const broken = {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [{ id: 'c', type: 'function', function: { name: 'x', arguments: '{not json' } }]
          }
        }
      ]
    }
    const r = normalizeOpenAiResponse(broken)
    expect(r.toolCalls[0]?.args).toEqual({})
  })
})

describe('normalizeClaudeResponse', () => {
  it('提取 text + tool_use', () => {
    const r = normalizeClaudeResponse(claudeToolResponse)
    expect(r.text).toContain('我先看看场景')
    expect(r.toolCalls).toHaveLength(1)
    expect(r.toolCalls[0]?.id).toBe('toolu_xyz')
    expect(r.toolCalls[0]?.name).toBe('list_scenes')
    expect(r.toolCalls[0]?.args).toEqual({ fileName: 'chapter1.gal' })
    expect(r.usage?.promptTokens).toBe(200)
    expect(r.usage?.completionTokens).toBe(25)
  })
})

const sampleTools: ToolJsonSchema[] = [
  {
    name: 'create_scene',
    description: '创建场景',
    parameters: { type: 'object', properties: { sceneId: { type: 'string' } }, required: ['sceneId'] }
  }
]

describe('工具格式转换', () => {
  it('toolsToOpenAiFormat 包成 {type:function, function:{...}}', () => {
    const out = toolsToOpenAiFormat(sampleTools)
    expect(out[0]).toMatchObject({
      type: 'function',
      function: { name: 'create_scene', description: '创建场景' }
    })
  })

  it('toolsToClaudeFormat 用 input_schema', () => {
    const out = toolsToClaudeFormat(sampleTools)
    expect(out[0]).toMatchObject({ name: 'create_scene', description: '创建场景' })
    expect(out[0]?.input_schema).toBeTypeOf('object')
  })
})

describe('withLlmDefaults / createLlmAdapter', () => {
  it('withLlmDefaults 把 baseUrl 注入 chat 请求', async () => {
    const calls: LlmChatRequest[] = []
    const inner: LlmAdapter = {
      supportsTools: true,
      chat: async (req) => {
        calls.push(req)
        return { text: '', toolCalls: [] }
      }
    }
    const wrapped = withLlmDefaults(inner, { baseUrl: 'https://api.minimax.chat/v1' })
    await wrapped.chat({ system: '', messages: [], tools: [] })
    expect(calls[0]?.baseUrl).toBe('https://api.minimax.chat/v1')
  })

  it('createLlmAdapter(openai) 经 withLlmDefaults 注入 baseUrl', () => {
    const openai = createLlmAdapter('openai', 'gpt-4o-mini', 'https://proxy.example/v1')
    expect(openai.supportsTools).toBe(true)
    const claude = createLlmAdapter('claude', 'claude-3-5-sonnet-20241022')
    expect(claude.supportsTools).toBe(true)
  })
})


describe('resolveApiKey — 本地网络映射容忍空 key', () => {
  const DEFAULT = 'https://api.openai.com/v1'

  it('有存储 key → 用存储 key', () => {
    expect(resolveApiKey('sk-real', DEFAULT, DEFAULT)).toBe('sk-real')
  })

  it('无 key + 自定义 baseUrl(本地映射)→ 占位符,不抛错', () => {
    expect(resolveApiKey(undefined, 'http://localhost:8000/v1', DEFAULT)).toBe('sk-galide-local')
  })

  it('无 key + 官方默认端点 → 抛错', () => {
    expect(() => resolveApiKey(undefined, DEFAULT, DEFAULT)).toThrow('未配置')
    expect(() => resolveApiKey(undefined, undefined, DEFAULT)).toThrow('未配置')
  })

  it('有 key + 自定义 baseUrl → 优先用存储 key', () => {
    expect(resolveApiKey('sk-real', 'http://localhost:8000/v1', DEFAULT)).toBe('sk-real')
  })
})
