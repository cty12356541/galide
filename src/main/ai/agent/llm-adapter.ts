/**
 * llm-adapter — provider 无关的 agent LLM 接口 + tool_calls 归一化
 *
 * 与流式 generate 分离:agent 需要「一次性带工具的 chat」,返回 text 或 toolCalls。
 * 各 provider 的原生 tool_calls(OpenAI)/ tool_use(Claude)归一为内部 ToolCall。
 *
 * 归一化是纯函数,fixture 驱动测试;SDK 调用部分不参与单测(不触网)。
 */
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { apiKeyStore } from '../key-store.js'
import { resolveApiKey, DEFAULT_OPENAI_BASE, DEFAULT_CLAUDE_BASE } from '../key-resolve.js'
import type { ChatMessage, AiProvider } from '../types.js'
import type { ToolCall } from './types.js'
import type { ToolJsonSchema } from './tool-registry.js'

export interface LlmUsage {
  promptTokens: number
  completionTokens: number
}

export interface LlmChatResponse {
  text: string
  toolCalls: ToolCall[]
  usage?: LlmUsage
}

export interface LlmChatRequest {
  system: string
  messages: ChatMessage[]
  tools: ToolJsonSchema[]
  model?: string
  baseUrl?: string
  signal?: AbortSignal
}

export interface LlmAdapter {
  /** 是否支持原生工具调用(false 时 loop 不广告工具 schema) */
  supportsTools: boolean
  chat: (req: LlmChatRequest) => Promise<LlmChatResponse>
}

const safeJsonParse = (s: string): unknown => {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}

// ----------------------------------------------------------------------------
// 纯归一化
// ----------------------------------------------------------------------------

interface OpenAiToolCall {
  id?: string
  function?: { name?: string; arguments?: string }
}
interface OpenAiMessage {
  content?: string | null
  tool_calls?: OpenAiToolCall[]
}
interface OpenAiResponse {
  choices?: Array<{ message?: OpenAiMessage }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export const normalizeOpenAiResponse = (resp: unknown): LlmChatResponse => {
  const r = resp as OpenAiResponse
  const message = r.choices?.[0]?.message
  const text = message?.content ?? ''
  const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((tc, i) => ({
    id: tc.id ?? `call_${i}`,
    name: tc.function?.name ?? '',
    args: safeJsonParse(tc.function?.arguments ?? '{}')
  }))
  const usage = r.usage
    ? { promptTokens: r.usage.prompt_tokens ?? 0, completionTokens: r.usage.completion_tokens ?? 0 }
    : undefined
  return { text, toolCalls, usage }
}

interface ClaudeBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: unknown
}
interface ClaudeResponse {
  content?: ClaudeBlock[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

export const normalizeClaudeResponse = (resp: unknown): LlmChatResponse => {
  const r = resp as ClaudeResponse
  const blocks = r.content ?? []
  const text = blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
  const toolCalls: ToolCall[] = blocks
    .filter((b) => b.type === 'tool_use')
    .map((b, i) => ({ id: b.id ?? `toolu_${i}`, name: b.name ?? '', args: b.input ?? {} }))
  const usage = r.usage
    ? { promptTokens: r.usage.input_tokens ?? 0, completionTokens: r.usage.output_tokens ?? 0 }
    : undefined
  return { text, toolCalls, usage }
}

// ----------------------------------------------------------------------------
// 工具格式转换
// ----------------------------------------------------------------------------

export interface OpenAiToolFormat {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export const toolsToOpenAiFormat = (tools: readonly ToolJsonSchema[]): OpenAiToolFormat[] =>
  tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }))

export interface ClaudeToolFormat {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export const toolsToClaudeFormat = (tools: readonly ToolJsonSchema[]): ClaudeToolFormat[] =>
  tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }))

// ----------------------------------------------------------------------------
// SDK-backed adapters(真实调用,不参与单测)
// ----------------------------------------------------------------------------

export const createOpenAiLlmAdapter = (model = 'gpt-4o-mini'): LlmAdapter => ({
  supportsTools: true,
  chat: async (req) => {
    const apiKey = resolveApiKey(apiKeyStore.get('openai'), req.baseUrl, DEFAULT_OPENAI_BASE)
    const client = new OpenAI({ apiKey, baseURL: req.baseUrl ?? DEFAULT_OPENAI_BASE })
    const resp = await client.chat.completions.create(
      {
        model: req.model ?? model,
        messages: [
          { role: 'system', content: req.system },
          ...req.messages.map((m) => ({ role: m.role, content: m.content }))
        ],
        ...(req.tools.length > 0 ? { tools: toolsToOpenAiFormat(req.tools), tool_choice: 'auto' as const } : {})
      },
      req.signal ? { signal: req.signal } : undefined
    )
    return normalizeOpenAiResponse(resp)
  }
})

export const createClaudeLlmAdapter = (model = 'claude-3-5-sonnet-20241022'): LlmAdapter => ({
  supportsTools: true,
  chat: async (req) => {
    const apiKey = resolveApiKey(apiKeyStore.get('claude'), req.baseUrl, DEFAULT_CLAUDE_BASE)
    const client = new Anthropic({ apiKey, ...(req.baseUrl ? { baseURL: req.baseUrl } : {}) })
    const resp = await client.messages.create(
      {
        model: req.model ?? model,
        max_tokens: 2048,
        system: req.system,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        // input_schema 运行期含 type:'object'(z.toJSONSchema 产出),SDK 类型更严,显式收窄
        ...(req.tools.length > 0
          ? { tools: toolsToClaudeFormat(req.tools) as unknown as Anthropic.Tool[] }
          : {})
      },
      req.signal ? { signal: req.signal } : undefined
    )
    return normalizeClaudeResponse(resp)
  }
})

export const createLlmAdapter = (
  provider: AiProvider,
  model?: string,
  baseUrl?: string
): LlmAdapter => {
  switch (provider) {
    case 'openai':
      return withLlmDefaults(createOpenAiLlmAdapter(model), { baseUrl })
    case 'claude':
      return withLlmDefaults(createClaudeLlmAdapter(model), { baseUrl })
  }
}

/** 注入默认 baseUrl/model,per-request 显式值优先 */
export const withLlmDefaults = (
  adapter: LlmAdapter,
  defaults: { baseUrl?: string; model?: string }
): LlmAdapter => ({
  supportsTools: adapter.supportsTools,
  chat: (req) =>
    adapter.chat({
      ...req,
      baseUrl: req.baseUrl ?? defaults.baseUrl,
      model: req.model ?? defaults.model
    })
})
