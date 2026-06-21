/**
 * command-tools — dispatch_command schema 与 domain 标注
 */
import { describe, it, expect, vi } from 'vitest'
import { commandTools } from './command-tools.js'
import type { ToolContext } from '../types.js'

describe('command-tools', () => {
  const dispatch = vi.fn(async () => ({ ok: true }))
  const ctx: ToolContext = {
    projectPath: '/p',
    fs: { readFile: async () => '', writeFile: async () => undefined, readdir: async () => [] },
    dispatch
  }

  it('dispatch_command 经 ctx.dispatch 投递', async () => {
    const tool = commandTools[0]!
    expect(tool.domain).toBe('renderer')
    expect(tool.risk).toBe('destructive')
    const r = await tool.run({ commandId: 'toggleAi' }, ctx)
    expect(r.ok).toBe(true)
    expect(dispatch).toHaveBeenCalledWith('toggleAi')
  })

  it('无 dispatch → 错误', async () => {
    const tool = commandTools[0]!
    const r = await tool.run({ commandId: 'export' }, {
      projectPath: '/p',
      fs: ctx.fs
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error?.code).toBe('NO_DISPATCH')
  })
})
