import OpenAI from 'openai'
import type { AiRequest, AiChunk } from '../types.js'
import { apiKeyStore } from '../key-store.js'

/**
 * OpenAI 兼容 provider
 * 默认 baseUrl: https://api.openai.com/v1
 * 可通过 req.baseUrl 覆盖 — 用于 OpenAI 兼容服务(MiniMax / minimaxi.com 等)
 */
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

export const createOpenAIProvider = (model = 'gpt-4o-mini') => {
  return {
    name: 'openai',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo', 'MiniMax-M3'],
    async generate(req: AiRequest, onChunk: (c: AiChunk) => void): Promise<void> {
      const apiKey = apiKeyStore.get('openai')
      if (!apiKey) {
        onChunk({
          type: 'error',
          error: { code: 'NO_API_KEY', message: '未配置 OpenAI API Key,请在设置中配置' }
        })
        return
      }
      const baseURL = req.baseUrl ?? DEFAULT_BASE_URL
      // 关键:请求级别的 model 优先(测试连接/AI 面板/任何调用方都尊重 req.model),
      // 工厂默认 model 仅在 req 没传时兜底
      const useModel = req.model ?? model
      const client = new OpenAI({ apiKey, baseURL })
      // 多轮:有 req.messages 用它,否则退回单条 prompt(向后兼容)
      const turns =
        req.messages && req.messages.length > 0
          ? req.messages.map((m) => ({ role: m.role, content: m.content }))
          : [{ role: 'user' as const, content: req.prompt }]
      onChunk({ type: 'start' })
      try {
       const stream = await client.chat.completions.create({
         model: useModel,
         messages: [
           { role: 'system', content: req.context },
           ...turns
         ],
          stream: true,
          ...(req.signal ? { signal: req.signal } : {})
       })
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? ''
          if (text) onChunk({ type: 'delta', text })
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
