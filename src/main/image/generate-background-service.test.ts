/**
 * generate-background-service 单测 — 名称守卫/尺寸与轮询来自偏好/写盘路径
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const generateImageMock = vi.fn()
const getPreferenceMock = vi.fn()

vi.mock('../ai/image/image-proxy.js', () => ({
  generateImage: (...a: unknown[]) => generateImageMock(...a)
}))
vi.mock('../preferences/preferences-store.js', () => ({
  getPreference: (k: string) => getPreferenceMock(k)
}))

import { generateBackgroundService, BACKGROUND_NAME_RE } from './generate-background-service.js'

describe('generateBackgroundService', () => {
  beforeEach(() => {
    generateImageMock.mockReset()
    getPreferenceMock.mockReset()
    getPreferenceMock.mockReturnValue({
      defaultProvider: 'comfyui',
      baseUrl: 'http://127.0.0.1:8188',
      width: 1344,
      height: 768,
      pollTimeoutMs: 600_000
    })
  })

  it('名称不合 slug → INVALID_NAME,不触发生成', async () => {
    const r = await generateBackgroundService({ projectPath: '/p', name: '../evil', prompt: 'x' })
    expect(r.ok).toBe(false)
    expect((r as { code: string }).code).toBe('INVALID_NAME')
    expect(generateImageMock).not.toHaveBeenCalled()
  })

  it('空 prompt → NO_PROMPT', async () => {
    const r = await generateBackgroundService({ projectPath: '/p', name: 'a', prompt: '  ' })
    expect(r.ok).toBe(false)
    expect((r as { code: string }).code).toBe('NO_PROMPT')
  })

  it('provider/端点/尺寸默认取偏好,轮询预算按 pollTimeoutMs 换算,写盘到 assets/backgrounds', async () => {
    generateImageMock.mockResolvedValue({ ok: true, imageBase64: 'aGk=', seed: 7 })
    const projectPath = await mkdtemp(join(tmpdir(), 'galide-bg-'))
    const r = await generateBackgroundService({ projectPath, name: 'harbor', prompt: 'sea' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.path).toBe('assets/backgrounds/harbor.png')
    const written = await readFile(join(projectPath, 'assets/backgrounds/harbor.png'))
    expect(written.toString()).toBe('hi')
    const call = generateImageMock.mock.calls[0]![0] as { provider: string; baseUrl: string; width: number; height: number }
    expect(call.provider).toBe('comfyui')
    expect(call.baseUrl).toBe('http://127.0.0.1:8188')
    expect(call.width).toBe(1344)
    expect(call.height).toBe(768)
    const deps = generateImageMock.mock.calls[0]![1] as { maxPollAttempts: number; pollIntervalMs: number }
    expect(deps.maxPollAttempts).toBe(600)
    expect(deps.pollIntervalMs).toBe(1000)
  })

  it('显式参数覆盖偏好;失败透传 code', async () => {
    generateImageMock.mockResolvedValue({ ok: false, code: 'HTTP_ERROR', message: 'ComfyUI HTTP 500' })
    const projectPath = await mkdtemp(join(tmpdir(), 'galide-bg-'))
    const r = await generateBackgroundService({
      projectPath,
      name: 'harbor',
      prompt: 'sea',
      provider: 'sd',
      width: 512,
      height: 512,
      baseUrl: 'http://x'
    })
    expect(r.ok).toBe(false)
    expect((r as { code: string }).code).toBe('HTTP_ERROR')
    const call = generateImageMock.mock.calls[0]![0] as { provider: string; width: number; baseUrl: string }
    expect(call.provider).toBe('sd')
    expect(call.width).toBe(512)
    expect(call.baseUrl).toBe('http://x')
  })

  it('BACKGROUND_NAME_RE 边界', () => {
    expect(BACKGROUND_NAME_RE.test('bookstore')).toBe(true)
    expect(BACKGROUND_NAME_RE.test('ch2-harbor_night')).toBe(true)
    expect(BACKGROUND_NAME_RE.test('有中文')).toBe(false)
    expect(BACKGROUND_NAME_RE.test('a/b')).toBe(false)
  })
})
