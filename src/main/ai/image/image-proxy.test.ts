/**
 * image-proxy — mock HTTP,断言 SD/DALL-E 请求体、seed/参考图一致性
 */
import { describe, it, expect, vi } from 'vitest'
import {
  buildComfyWorkflow,
  buildSdPayload,
  buildDallePayload,
  generateImage
} from './image-proxy.js'

describe('image-proxy — 请求体构建', () => {
  it('buildSdPayload 固定 seed 与 referenceImage', () => {
    const p = buildSdPayload(
      { provider: 'sd', prompt: 'girl, anime', referenceImageBase64: 'abc123', seed: 42 },
      42
    )
    expect(p.seed).toBe(42)
    expect(p.prompt).toBe('girl, anime')
    expect(p.init_images).toEqual(['abc123'])
    expect(p.denoising_strength).toBe(0.55)
  })

  it('buildSdPayload 相同 seed+prompt 参数一致', () => {
    const req = { provider: 'sd' as const, prompt: 'test', seed: 99 }
    expect(buildSdPayload(req, 99)).toEqual(buildSdPayload(req, 99))
  })

  it('buildDallePayload 含 size', () => {
    const p = buildDallePayload({ provider: 'dalle', prompt: 'cat', width: 512, height: 512 })
    expect(p.prompt).toBe('cat')
    expect(p.size).toBe('512x512')
  })

  it('buildComfyWorkflow 含 prompt/seed/尺寸与 SaveImage 节点', () => {
    const wf = buildComfyWorkflow(
      { provider: 'comfyui', prompt: 'anime girl', negativePrompt: 'bad', width: 640, height: 960, seed: 11 },
      11
    )
    expect(wf['6']).toEqual(expect.objectContaining({ inputs: expect.objectContaining({ text: 'anime girl' }) }))
    expect(wf['7']).toEqual(expect.objectContaining({ inputs: expect.objectContaining({ text: 'bad' }) }))
    expect(wf['5']).toEqual(
      expect.objectContaining({ inputs: expect.objectContaining({ width: 640, height: 960 }) })
    )
    expect(wf['3']).toEqual(expect.objectContaining({ inputs: expect.objectContaining({ seed: 11 }) }))
    expect(wf['9']).toEqual(expect.objectContaining({ class_type: 'SaveImage' }))
  })
})

describe('image-proxy — mock HTTP', () => {
  it('SD 成功返回 base64', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ images: ['imgb64'] })
    }))
    const fetchFn = fetchMock as unknown as typeof fetch

    const r = await generateImage(
      { provider: 'sd', prompt: 'x', seed: 7, baseUrl: 'http://sd.local' },
      { fetchFn }
    )
    expect(r.ok).toBe(true)
    if (r.ok === true) {
      expect(r.imageBase64).toBe('imgb64')
      expect(r.seed).toBe(7)
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'http://sd.local/sdapi/v1/txt2img',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"seed":7')
      })
    )
  })

  it('DALL-E 无 Key → NO_API_KEY', async () => {
    const r = await generateImage(
      { provider: 'dalle', prompt: 'x' },
      { fetchFn: vi.fn() as typeof fetch, getApiKey: () => undefined }
    )
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.code).toBe('NO_API_KEY')
  })

  it('HTTP 错误 → HTTP_ERROR', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch
    const r = await generateImage(
      { provider: 'sd', prompt: 'x', baseUrl: 'http://sd.local' },
      { fetchFn }
    )
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.code).toBe('HTTP_ERROR')
  })
})

describe('image-proxy — ComfyUI workflow', () => {
  it('提交 workflow → 轮询 history → /view 取图', async () => {
    let historyPolls = 0
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'http://comfy.local/prompt') {
        const body = JSON.parse(String(init?.body)) as { prompt: Record<string, unknown> }
        expect(body.prompt['6']).toEqual(
          expect.objectContaining({ inputs: expect.objectContaining({ text: 'portrait' }) })
        )
        expect(body.prompt['3']).toEqual(
          expect.objectContaining({ inputs: expect.objectContaining({ seed: 42 }) })
        )
        return { ok: true, json: async () => ({ prompt_id: 'pid-abc' }) }
      }
      if (url === 'http://comfy.local/history/pid-abc') {
        historyPolls += 1
        if (historyPolls === 1) return { ok: true, json: async () => ({}) }
        return {
          ok: true,
          json: async () => ({
            'pid-abc': {
              outputs: {
                '9': { images: [{ filename: 'galide_00001_.png', subfolder: '', type: 'output' }] }
              }
            }
          })
        }
      }
      if (url.startsWith('http://comfy.local/view?')) {
        expect(url).toContain('filename=galide_00001_.png')
        const buf = Buffer.from('png-data')
        return {
          ok: true,
          arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
        }
      }
      throw new Error(`unexpected url ${url}`)
    })
    const sleep = vi.fn(async () => {})
    const r = await generateImage(
      { provider: 'comfyui', prompt: 'portrait', seed: 42, baseUrl: 'http://comfy.local' },
      { fetchFn: fetchMock as unknown as typeof fetch, sleep, pollIntervalMs: 1, maxPollAttempts: 5 }
    )
    expect(r.ok).toBe(true)
    if (r.ok === true) {
      expect(r.imageBase64).toBe(Buffer.from('png-data').toString('base64'))
      expect(r.seed).toBe(42)
    }
    expect(historyPolls).toBe(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('history 一直未完成 → GENERATION_FAILED 超时', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/prompt')) {
        return { ok: true, json: async () => ({ prompt_id: 'pid-timeout' }) }
      }
      if (url.includes('/history/')) {
        return { ok: true, json: async () => ({}) }
      }
      throw new Error(`unexpected url ${url}`)
    })
    const r = await generateImage(
      { provider: 'comfyui', prompt: 'x', baseUrl: 'http://comfy.local' },
      {
        fetchFn: fetchMock as unknown as typeof fetch,
        sleep: async () => {},
        pollIntervalMs: 0,
        maxPollAttempts: 2
      }
    )
    expect(r.ok).toBe(false)
    if (r.ok === false) {
      expect(r.code).toBe('GENERATION_FAILED')
      expect(r.message).toContain('超时')
    }
  })

  it('ComfyUI /prompt HTTP 错误 → HTTP_ERROR', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/prompt')) return { ok: false, status: 503 }
      throw new Error(`unexpected url ${url}`)
    }) as unknown as typeof fetch
    const r = await generateImage(
      { provider: 'comfyui', prompt: 'x', baseUrl: 'http://comfy.local' },
      { fetchFn }
    )
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.code).toBe('HTTP_ERROR')
  })
})
