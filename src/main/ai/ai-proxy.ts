/**
 * AI 统一代理 - 策略模式切换 provider
 * 所有 AI 请求都经此,Key 走 key-store(加密)
 * 本地网络映射模型统一走 openai + 自定义 BaseUrl(见 key-resolve)
 */

import type { AiRequest, AiChunk, AiProviderInfo, AiConfig } from './types.js'
import { createOpenAIProvider } from './providers/openai-provider.js'
import { createClaudeProvider } from './providers/claude-provider.js'
import { getStore } from '../store/store.js'

const PROVIDER_REGISTRY = {
  openai: () => createOpenAIProvider(),
  claude: () => createClaudeProvider()
} as const

export const aiProxy = {
  listProviders: (): AiProviderInfo[] => [
    { id: 'openai', name: 'OpenAI 兼容(含 MiniMax / 本地映射)', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'MiniMax-M3'] },
    { id: 'claude', name: 'Claude', models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'] }
  ],

 getConfig: (): AiConfig => {
   const cfg = getStore().get('aiConfig') as AiConfig | undefined
    // 迁移:旧版可能存了已移除的 'ollama'(本地映射现统一走 openai + BaseUrl)
    if (cfg && cfg.provider !== 'openai' && cfg.provider !== 'claude') return { provider: 'openai', baseUrl: cfg.baseUrl, model: cfg.model }
    return cfg ?? { provider: 'openai' }
  },

  setConfig: (config: AiConfig): void => {
    getStore().set('aiConfig', config)
  },

  generate: async (req: AiRequest, onChunk: (c: AiChunk) => void): Promise<void> => {
    // provider 工厂返回的实例,在 generate() 内部读 req.model ?? 工厂默认 model
    // (三层 fallback: req.model > 工厂默认 model > 硬编码)
    // — 见 providers/openai-provider.ts: 'const useModel = req.model ?? model'
    const provider = PROVIDER_REGISTRY[req.provider]()
    await provider.generate(req, onChunk)
  }
}
