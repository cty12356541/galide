/** 加密 key-store 支持的 provider id(AI 提供商 + TTS 等) */
export type ApiKeyProvider = 'openai' | 'claude' | 'ollama' | 'elevenlabs'

export const API_KEY_PROVIDERS: readonly ApiKeyProvider[] = [
  'openai',
  'claude',
  'ollama',
  'elevenlabs'
]

export const isApiKeyProvider = (s: string): s is ApiKeyProvider =>
  (API_KEY_PROVIDERS as readonly string[]).includes(s)
