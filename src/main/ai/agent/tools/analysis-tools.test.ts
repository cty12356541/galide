/**
 * analysis-tools 单测 — analyze_reachability 单文件与全项目(merged)模式
 */
import { describe, it, expect } from 'vitest'
import { createToolRegistry } from '../tool-registry.js'
import { analysisTools } from './analysis-tools.js'
import type { ToolContext } from '../types.js'

const makeCtx = (files: Record<string, string>): ToolContext => ({
  projectPath: '/proj',
  fs: {
    readFile: async (p): Promise<string> => {
      const name = p.split('/').pop()!
      if (!(name in files)) throw new Error(`ENOENT: ${p}`)
      return files[name]!
    },
    writeFile: async () => undefined,
    readdir: async () => Object.keys(files)
  }
})

const run = async (ctx: ToolContext, args: { fileName?: string }) => {
  const registry = createToolRegistry([...analysisTools])
  return registry.execute({ id: 't1', name: 'analyze_reachability', args }, ctx)
}

describe('analyze_reachability 工具', () => {
  it('省略 fileName:全项目 merged 分析,跨文件跳转的可达性正确', async () => {
    const ctx = makeCtx({
      'a.gal': '## start\n小雪: "hi"\n[跳转:b_intro]\n',
      'b.gal': '## b_intro\n小雪: "there"\n'
    })
    const result = await run(ctx, {})
    expect(result.ok).toBe(true)
    expect(result.content).toContain('全项目')
    expect(result.content).toContain('不可达(0)')
  })

  it('省略 fileName:跨文件悬空跳转被捕获', async () => {
    const ctx = makeCtx({
      'a.gal': '## start\n小雪: "hi"\n[跳转:nowhere]\n',
      'b.gal': '## b_intro\n小雪: "x"\n'
    })
    const result = await run(ctx, {})
    expect(result.ok).toBe(true)
    expect(result.content).toContain('nowhere')
  })

  it('指定 fileName:单文件分析,跨文件目标视为悬空', async () => {
    const ctx = makeCtx({
      'a.gal': '## start\n[跳转:b_intro]\n',
      'b.gal': '## b_intro\n小雪: "x"\n'
    })
    const result = await run(ctx, { fileName: 'a.gal' })
    expect(result.ok).toBe(true)
    expect(result.content).toContain('a.gal')
    expect(result.content).toContain('b_intro') // 单文件视角下是悬空
  })

  it('没有脚本文件 → 失败', async () => {
    const ctx = makeCtx({})
    const result = await run(ctx, {})
    expect(result.ok).toBe(false)
    expect(result.content).toContain('没有')
  })

  it('解析失败 → 失败并指出文件', async () => {
    const ctx = makeCtx({ 'bad.gal': '背景: assets/bg.png\n' })
    const result = await run(ctx, {})
    expect(result.ok).toBe(false)
    expect(result.content).toContain('bad.gal')
  })
})
