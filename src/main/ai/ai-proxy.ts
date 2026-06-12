/**
 * AI 统一代理 - 策略模式切换 provider
 * 所有 AI 请求都经此,Key 走 key-store(加密)
 */

import type { AiRequest, AiChunk, AiProviderInfo, AiConfig } from './types.js'
import { createOpenAIProvider } from './providers/openai-provider.js'
import { createClaudeProvider } from './providers/claude-provider.js'
import { createOllamaProvider } from './providers/ollama-provider.js'
import { getStore } from '../store/store.js'

const PROVIDER_REGISTRY = {
  openai: () => createOpenAIProvider(),
  claude: () => createClaudeProvider(),
  ollama: () => createOllamaProvider()
} as const

export const aiProxy = {
  listProviders: (): AiProviderInfo[] => [
    { id: 'openai', name: 'OpenAI (含 MiniMax)', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'MiniMax-M3'] },
    { id: 'claude', name: 'Claude', models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'] },
    { id: 'ollama', name: 'Ollama (本地)', models: ['qwen2.5', 'llama3.1', 'mistral'] }
  ],

  getConfig: (): AiConfig => {
    const cfg = getStore().get('aiConfig') as AiConfig | undefined
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
