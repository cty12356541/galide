/**
 * agent-git — snapshot / rollback 安全闸
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAgentGit } from './agent-git.js'

const resetHard = vi.fn()
const snapshot = vi.fn()

vi.mock('../../git/git-service.js', () => ({
  gitService: {
    snapshot: (...args: unknown[]) => snapshot(...args),
    resetHard: (...args: unknown[]) => resetHard(...args)
  }
}))

describe('agent-git', () => {
  beforeEach(() => {
    resetHard.mockReset()
    snapshot.mockReset()
  })

  it('rollback 无 ref 时不调用 resetHard', async () => {
    const git = createAgentGit('/proj')
    const r = await git.rollback(undefined)
    expect(r.ok).toBe(false)
    expect(resetHard).not.toHaveBeenCalled()
  })

  it('rollback 有 ref 时传给 gitService.resetHard', async () => {
    resetHard.mockResolvedValue({ ok: true, value: true })
    const git = createAgentGit('/proj')
    const r = await git.rollback('abc123')
    expect(r.ok).toBe(true)
    expect(resetHard).toHaveBeenCalledWith('/proj', 'abc123')
  })
})
