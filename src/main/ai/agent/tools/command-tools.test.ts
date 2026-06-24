/**
 * command-tools — navigate / dispatch_command schema 与 domain/risk 标注
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

  const navigate = commandTools.find((t) => t.name === 'navigate')!
  const dispatchCommand = commandTools.find((t) => t.name === 'dispatch_command')!

  it('navigate 为 read 风险,投递视图命令', async () => {
    expect(navigate.domain).toBe('renderer')
    expect(navigate.risk).toBe('read')
    const r = await navigate.run({ commandId: 'toggleAi' }, ctx)
    expect(r.ok).toBe(true)
    expect(dispatch).toHaveBeenCalledWith('toggleAi')
  })

  it('dispatch_command 为 destructive 风险,投递状态命令', async () => {
    expect(dispatchCommand.risk).toBe('destructive')
    const r = await dispatchCommand.run({ commandId: 'export' }, ctx)
    expect(r.ok).toBe(true)
    expect(dispatch).toHaveBeenCalledWith('export')
  })

  it('视图命令不能走 dispatch_command(schema 拒绝)', async () => {
    const r = await dispatchCommand.run({ commandId: 'toggleAi' }, ctx)
    expect(r.ok).toBe(false)
  })

  it('无 dispatch → NO_DISPATCH', async () => {
    const r = await navigate.run({ commandId: 'showOutline' }, {
      projectPath: '/p',
      fs: ctx.fs
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error?.code).toBe('NO_DISPATCH')
  })
})
