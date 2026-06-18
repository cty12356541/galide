export type AiProvider = 'openai' | 'claude' | 'ollama'

export type AiConfig = {
  provider: AiProvider
  baseUrl?: string
  model?: string
}

export type AiProviderInfo = {
  id: AiProvider
  name: string
  models: string[]
}

export type AiRequest = {
  prompt: string
  context: string
  provider: AiProvider
  model?: string
  /** 覆盖 provider 默认 baseUrl(用于 OpenAI 兼容服务,如 MiniMax) */
  baseUrl?: string
  /** 可选 abort signal — 任务取消 / 超时时由调用方触发,provider 据此中断底层请求 */
  signal?: AbortSignal
}

export type AiChunk = {
  type: 'start' | 'delta' | 'end' | 'error'
  text?: string
  error?: { code: string; message: string }
}

export type AiError = {
  code: 'PROVIDER_ERROR' | 'NO_API_KEY' | 'NETWORK' | 'RATE_LIMIT'
  message: string
}

export type AiResult<T> = { ok: true; value: T } | { ok: false; error: AiError }
