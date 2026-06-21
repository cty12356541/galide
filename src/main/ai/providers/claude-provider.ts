import Anthropic from '@anthropic-ai/sdk'
import type { AiRequest, AiChunk } from '../types.js'
import { apiKeyStore } from '../key-store.js'

export const createClaudeProvider = (model = 'claude-3-5-sonnet-20241022') => {
  return {
    name: 'claude',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
    async generate(req: AiRequest, onChunk: (c: AiChunk) => void): Promise<void> {
      const apiKey = apiKeyStore.get('claude')
      if (!apiKey) {
        onChunk({
          type: 'error',
          error: { code: 'NO_API_KEY', message: '未配置 Claude API Key,请在设置中配置' }
        })
        return
      }
      const client = new Anthropic({ apiKey })
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
