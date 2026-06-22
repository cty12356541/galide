import { describe, it, expect } from 'vitest'
import { isTtsUnavailable, ttsUnavailableReason } from './tts-availability.js'

describe('tts-availability', () => {
  it('edge 可用', () => {
    expect(isTtsUnavailable('edge', false)).toBe(false)
  })

  it('local 不可用', () => {
    expect(isTtsUnavailable('local', false)).toBe(true)
  })

  it('elevenlabs 无 key 不可用', () => {
    expect(isTtsUnavailable('elevenlabs', false)).toBe(true)
    expect(isTtsUnavailable('elevenlabs', true)).toBe(false)
  })

  it('ttsUnavailableReason 针对 elevenlabs', () => {
    expect(ttsUnavailableReason('elevenlabs', false)).toContain('ElevenLabs')
  })
})
