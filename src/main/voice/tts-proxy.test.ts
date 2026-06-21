/**
 * tts-proxy — mock Edge TTS / ElevenLabs,断言 voiceId 映射与产物落盘
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFsFromVolume, Volume } from 'memfs'
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

describe('tts-proxy — ElevenLabs', () => {
  const elevenPrefs = {
    defaultProvider: 'elevenlabs' as const,
    defaultVoiceId: 'voice-default-123',
    batchConcurrency: 4
  }

  it('generate 发送正确 body/headers 并写入 mp3(memfs)', async () => {
    const vol = Volume.fromJSON({ '/voice': null })
    const mfs = createFsFromVolume(vol)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/custom-voice-id')
      expect(init?.headers).toEqual(
        expect.objectContaining({
          'xi-api-key': 'el-key',
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg'
        })
      )
      const body = JSON.parse(String(init?.body)) as { text: string; model_id: string }
      expect(body.text).toBe('你好世界')
      expect(body.model_id).toBe('eleven_multilingual_v2')
      return {
        ok: true,
        arrayBuffer: async () => {
          const buf = Buffer.from('el-audio')
          return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
        }
      }
    })
    const proxy = createTtsProxy({
      fetchFn: fetchMock as unknown as typeof fetch,
      getApiKey: () => 'el-key',
      writeFile: (p, d) => mfs.promises.writeFile(p, d) as Promise<void>
    })
    const out = '/voice/line1.mp3'
    const r = await proxy.generate('你好世界', 'char-1', out, elevenPrefs, { voiceId: 'custom-voice-id' })
    expect(r.ok).toBe(true)
    if (r.ok === true) expect(r.path).toBe(out)
    expect(Buffer.from(mfs.readFileSync(out) as Buffer).equals(Buffer.from('el-audio'))).toBe(true)
  })

  it('无 API Key → NO_API_KEY', async () => {
    const proxy = createTtsProxy({
      fetchFn: vi.fn() as typeof fetch,
      getApiKey: () => undefined
    })
    const r = await proxy.generate('hi', 'x', '/out.mp3', elevenPrefs)
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.code).toBe('NO_API_KEY')
  })

  it('ElevenLabs HTTP 错误 → PROVIDER_ERROR', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 401 })) as unknown as typeof fetch
    const proxy = createTtsProxy({ fetchFn, getApiKey: () => 'el-key' })
    const r = await proxy.generate('hi', 'x', '/out.mp3', elevenPrefs)
    expect(r.ok).toBe(false)
    if (r.ok === false) {
      expect(r.code).toBe('PROVIDER_ERROR')
      expect(r.message).toContain('401')
    }
  })

  it('voiceId 回退 VoicePreferences.defaultVoiceId', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain('voice-default-123')
      return { ok: true, arrayBuffer: async () => Buffer.from('x').buffer }
    })
    const proxy = createTtsProxy({
      fetchFn: fetchMock as unknown as typeof fetch,
      getApiKey: () => 'el-key',
      writeFile: async () => {}
    })
    await proxy.generate('hi', 'unknown-char', '/out.mp3', elevenPrefs)
  })
})
