import { describe, it, expect } from 'vitest'
import {
  voiceSidecarRelPath,
  voiceSidecarAbsPath,
  parseVoiceSidecar,
  serializeVoiceSidecar
} from './voice-sidecar.js'
import { join } from 'node:path'

describe('voice-sidecar path security', () => {
  it('rejects lineId containing path traversal (..)', () => {
    expect(() => voiceSidecarRelPath('../../../etc/passwd')).toThrow('lineId contains path traversal')
    expect(() => voiceSidecarAbsPath('/tmp/project', '../../../etc/passwd')).toThrow('lineId contains path traversal')
  })

  it('rejects lineId containing backslash traversal', () => {
    expect(() => voiceSidecarRelPath('..\\..\\windows\\system32')).toThrow('lineId contains path traversal')
  })

  it('rejects lineId with percent-encoded traversal', () => {
    expect(() => voiceSidecarRelPath('..%2f..%2fetc%2fpasswd')).toThrow('lineId contains path traversal')
  })

  it('accepts safe lineId with hyphen, underscore, dot, number', () => {
    const safeLineId = 'scene-01_2.0'
    expect(voiceSidecarRelPath(safeLineId)).toBe('assets/voice/scene-01_2.0.meta.json')
    expect(voiceSidecarAbsPath('/tmp/project', safeLineId)).toBe(
      join('/tmp/project', 'assets/voice/scene-01_2.0.meta.json')
    )
  })

  it('rejects lineId containing colon (Windows drive letter)', () => {
    expect(() => voiceSidecarRelPath('C:/windows/system32')).toThrow('lineId contains path traversal')
  })

  it('rejects lineId with absolute slash prefix', () => {
    expect(() => voiceSidecarRelPath('/etc/passwd')).toThrow('lineId contains path traversal')
  })

  it('rejects lineId with null byte injection', () => {
    expect(() => voiceSidecarRelPath('safe\0../../../etc/passwd')).toThrow('lineId contains path traversal')
  })

  it('rejects empty lineId', () => {
    expect(() => voiceSidecarRelPath('')).toThrow('lineId must be non-empty')
  })
})

describe('voice-sidecar parse / serialize', () => {
  it('round-trips valid meta', () => {
    const meta = { text: 'Hello world', characterId: 'char-1' }
    const serialized = serializeVoiceSidecar(meta)
    expect(parseVoiceSidecar(serialized)).toEqual(meta)
  })

  it('returns null for invalid JSON', () => {
    expect(parseVoiceSidecar('not json')).toBeNull()
  })

  it('returns null when fields are missing', () => {
    expect(parseVoiceSidecar('{"text":"hello"}')).toBeNull()
    expect(parseVoiceSidecar('{"characterId":"char"}')).toBeNull()
  })
})
