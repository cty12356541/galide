/**
 * tts-proxy — mock Edge TTS,断言 voiceId 映射与产物落盘
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createTtsProxy, resolveVoiceId } from './tts-proxy.js'

const voicePrefs = {
  defaultProvider: 'edge' as const,
  defaultVoiceId: 'zh-CN-XiaoxiaoNeural',
  batchConcurrency: 4
}

describe('tts-proxy — voiceId 映射', () => {
  it('resolveVoiceId 优先 character voiceConfig', () => {
    expect(resolveVoiceId('char-1', { voiceId: 'ja-JP-NanamiNeural' }, 'zh-CN-XiaoxiaoNeural')).toBe(
      'ja-JP-NanamiNeural'
    )
  })

  it('resolveVoiceId 回退 defaultVoiceId', () => {
    expect(resolveVoiceId('char-1', undefined, 'zh-CN-YunxiNeural')).toBe('zh-CN-YunxiNeural')
  })
})

describe('tts-proxy — mock 合成', () => {
  let tmpDir = ''

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'galide-tts-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('generate 写入 mp3 到 outputPath', async () => {
    const fakeAudio = Buffer.from('fake-mp3-bytes')
    const proxy = createTtsProxy({
      synthesize: async () => fakeAudio
    })
    const out = join(tmpDir, 'line1.mp3')
    const r = await proxy.generate('你好', 'zh-female', out, voicePrefs)
    expect(r.ok).toBe(true)
    if (r.ok === true) expect(r.path).toBe(out)
    expect(readFileSync(out).equals(fakeAudio)).toBe(true)
  })

  it('空 text → GENERATION_FAILED', async () => {
    const proxy = createTtsProxy({ synthesize: async () => Buffer.alloc(0) })
    const r = await proxy.generate('', 'x', join(tmpDir, 'a.mp3'), voicePrefs)
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.code).toBe('GENERATION_FAILED')
  })

  it('synthesize 抛错 → GENERATION_FAILED', async () => {
    const proxy = createTtsProxy({
      synthesize: async () => {
        throw new Error('network down')
      }
    })
    const r = await proxy.generate('hi', 'x', join(tmpDir, 'b.mp3'), voicePrefs)
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.code).toBe('GENERATION_FAILED')
  })
})
