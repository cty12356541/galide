/**
 * store.withRetry 单测
 * 规约: electron-store 在 dev hot-reload 时偶发 ELIFECYCLE lock,
 *       写操作应自动 retry 几次后放弃。
 */
import { describe, it, expect, vi } from 'vitest'

const { withRetry } = await import('./store-with-retry.js')

describe('withRetry', () => {
  it('returns immediately on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const r = await withRetry(fn, { retries: 3, delayMs: 1 })
    expect(r).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries up to N times on EBUSY-style errors', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'ELIFECYCLE' }))
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'ELIFECYCLE' }))
      .mockResolvedValueOnce('ok')
    const r = await withRetry(fn, { retries: 3, delayMs: 1 })
    expect(r).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws after exhausting retries', async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('busy'), { code: 'ELIFECYCLE' }))
    await expect(withRetry(fn, { retries: 2, delayMs: 1 })).rejects.toThrow('busy')
    expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it('does not retry on non-lock errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('EACCES'))
    await expect(withRetry(fn, { retries: 3, delayMs: 1 })).rejects.toThrow('EACCES')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
