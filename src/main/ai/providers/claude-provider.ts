import Anthropic from '@anthropic-ai/sdk'
import type { AiRequest, AiChunk } from '../types.js'
import { apiKeyStore } from '../key-store.js'
import { resolveApiKey, DEFAULT_CLAUDE_BASE } from '../key-resolve.js'

/**
 * Claude (Anthropic) provider
 * 可通过 req.baseUrl 覆盖 — 用于 Anthropic 兼容代理 / 本地网络映射端点
 * 本地映射端点通常不校验 key,无 key + 自定义 baseUrl 时用占位符(见 key-resolve)
 */
export const createClaudeProvider = (model = 'claude-3-5-sonnet-20241022') => {
  return {
    name: 'claude',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
    async generate(req: AiRequest, onChunk: (c: AiChunk) => void): Promise<void> {
      let apiKey: string
      try {
        apiKey = resolveApiKey(apiKeyStore.get('claude'), req.baseUrl, DEFAULT_CLAUDE_BASE)
      } catch {
        onChunk({
          type: 'error',
          error: { code: 'NO_API_KEY', message: '未配置 Claude API Key,请在设置中配置(本地网络映射端点可省略 key,但需设 BaseUrl)' }
        })
        return
      }
      const client = new Anthropic({ apiKey, ...(req.baseUrl ? { baseURL: req.baseUrl } : {}) })
      onChunk({ type: 'start' })
      try {
        // 请求级 model 优先(req.model ?? 工厂默认)
        const useModel = req.model ?? model
        // 多轮:有 req.messages 用它,否则退回单条 prompt
        const turns =
          req.messages && req.messages.length > 0
            ? req.messages.map((m) => ({ role: m.role, content: m.content }))
            : [{ role: 'user' as const, content: req.prompt }]
       const stream = await client.messages.stream({
         model: useModel,
         max_tokens: 2048,
         system: req.context,
         messages: turns,
         ...(req.signal ? { signal: req.signal } : {})
       })
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            onChunk({ type: 'delta', text: event.delta.text })
          }
        }
        onChunk({ type: 'end' })
      } catch (err) {
        onChunk({
          type: 'error',
          error: {
            code: 'PROVIDER_ERROR',
            message: err instanceof Error ? err.message : String(err)
          }
        })
      }
    }
  }
}
