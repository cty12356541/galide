import { describe, it, expect } from 'vitest'
import { VoiceGenerateSchema, VoiceDeleteSchema } from './index.js'

describe('VoiceGenerateSchema security', () => {
  it('accepts safe lineId', () => {
    const result = VoiceGenerateSchema.parse({
      projectPath: '/tmp/project',
      lineId: 'scene-01-0',
      text: 'Hello',
      characterId: 'char-1'
    })
    expect(result.lineId).toBe('scene-01-0')
  })

  it('rejects lineId with path traversal (..)', () => {
    expect(() =>
      VoiceGenerateSchema.parse({
        projectPath: '/tmp/project',
        lineId: '../../../etc/passwd',
        text: 'Hello',
        characterId: 'char-1'
      })
    ).toThrow('lineId contains path traversal')
  })

  it('rejects lineId with backslash traversal', () => {
    expect(() =>
      VoiceGenerateSchema.parse({
        projectPath: '/tmp/project',
        lineId: '..\\..\\windows\\system32',
        text: 'Hello',
        characterId: 'char-1'
      })
    ).toThrow('lineId contains path traversal')
  })

  it('rejects lineId with absolute slash prefix', () => {
    expect(() =>
      VoiceGenerateSchema.parse({
        projectPath: '/tmp/project',
        lineId: '/etc/passwd',
        text: 'Hello',
        characterId: 'char-1'
      })
    ).toThrow('lineId contains path traversal')
  })

  it('rejects lineId with percent-encoded traversal', () => {
    expect(() =>
      VoiceGenerateSchema.parse({
        projectPath: '/tmp/project',
        lineId: '..%2f..%2fetc%2fpasswd',
        text: 'Hello',
        characterId: 'char-1'
      })
    ).toThrow('lineId contains path traversal')
  })

  it('rejects lineId with null byte', () => {
    expect(() =>
      VoiceGenerateSchema.parse({
        projectPath: '/tmp/project',
        lineId: 'safe\0../../../etc/passwd',
        text: 'Hello',
        characterId: 'char-1'
      })
    ).toThrow('lineId contains path traversal')
  })
})

describe('VoiceDeleteSchema security', () => {
  it('accepts safe lineId', () => {
    const result = VoiceDeleteSchema.parse({
      projectPath: '/tmp/project',
      lineId: 'scene-01-0'
    })
    expect(result.lineId).toBe('scene-01-0')
  })

  it('rejects lineId with path traversal', () => {
    expect(() =>
      VoiceDeleteSchema.parse({
        projectPath: '/tmp/project',
        lineId: '../../../etc/passwd'
      })
    ).toThrow('lineId contains path traversal')
  })

  it('rejects lineId with backslash traversal', () => {
    expect(() =>
      VoiceDeleteSchema.parse({
        projectPath: '/tmp/project',
        lineId: '..\\..\\windows\\system32'
      })
    ).toThrow('lineId contains path traversal')
  })
})
