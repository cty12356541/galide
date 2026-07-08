/**
 * agent-runtime — 可变项目根(建项/开项后 agent 工具链跟随)
 */
import { describe, it, expect } from 'vitest'
import { createAgentRuntime } from './agent-runtime.js'

describe('createAgentRuntime', () => {
  it('初始 projectPath 可读', () => {
    const rt = createAgentRuntime({ projectPath: '/old' })
    expect(rt.getProjectPath()).toBe('/old')
  })

  it('switchProject 更新后续 getProjectPath', () => {
    const rt = createAgentRuntime({ projectPath: '/old' })
    rt.switchProject({ projectPath: '/new', manifest: { name: 'New' } as never })
    expect(rt.getProjectPath()).toBe('/new')
  })

  it('createToolContext.projectPath 随 switchProject 变化', async () => {
    const rt = createAgentRuntime({ projectPath: '/old' })
    const ctx = rt.createToolContext({
      fs: {
        readFile: async () => '',
        writeFile: async () => undefined,
        readdir: async () => []
      },
      onProjectOpened: async () => undefined
    })
    expect(ctx.projectPath).toBe('/old')
    await ctx.switchProject!({ projectPath: '/new', manifest: { name: 'New' } as never })
    expect(ctx.projectPath).toBe('/new')
  })
})
