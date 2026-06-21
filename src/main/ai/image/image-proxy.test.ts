/**
 * image-proxy — mock HTTP,断言 SD/DALL-E 请求体、seed/参考图一致性
 */
import { describe, it, expect, vi } from 'vitest'
import { buildSdPayload, buildDallePayload, generateImage } from './image-proxy.js'

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
