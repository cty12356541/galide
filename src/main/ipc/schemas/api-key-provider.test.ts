import { describe, it, expect } from 'vitest'
import { ApiKeyProviderSchema } from './index.js'

describe('ApiKeyProviderSchema', () => {
  it('accepts elevenlabs alongside AI providers', () => {
    expect(ApiKeyProviderSchema.parse('elevenlabs')).toBe('elevenlabs')
    expect(ApiKeyProviderSchema.parse('openai')).toBe('openai')
    expect(ApiKeyProviderSchema.parse('claude')).toBe('claude')
  })

  it('rejects unknown provider ids', () => {
    expect(() => ApiKeyProviderSchema.parse('unknown')).toThrow()
  })
})
