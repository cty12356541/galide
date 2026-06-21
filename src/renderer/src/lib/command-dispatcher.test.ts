/**
 * command-dispatcher — agent:dispatchCommand 投递测试
 */
import { describe, it, expect, vi } from 'vitest'
import { dispatchCommand, registerCommandHandler } from './command-dispatcher.js'

describe('command-dispatcher', () => {
  it('未知 CommandId → error', async () => {
    const r = await dispatchCommand('not-a-real-command')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('unknown')
  })

  it('已注册 handler 被调用', async () => {
    const fn = vi.fn()
    registerCommandHandler('toggleAi', fn)
    const r = await dispatchCommand('toggleAi')
    expect(r.ok).toBe(true)
    expect(fn).toHaveBeenCalled()
  })
})
