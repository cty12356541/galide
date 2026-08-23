/**
 * brain-tools 单测 — 注册/读写/确认分级
 */
import { describe, it, expect } from 'vitest'
import { createToolRegistry } from '../tool-registry.js'
import { createAutonomyGate } from '../autonomy-gate.js'
import { brainTools } from './brain-tools.js'
import type { ToolContext, ToolRisk } from '../types.js'

const makeCtx = (): { ctx: ToolContext; files: Record<string, string> } => {
  const files: Record<string, string> = {}
  const ctx: ToolContext = {
    projectPath: '/proj',
    fs: {
      readFile: async (p) => {
        if (!(p in files)) throw new Error(`ENOENT: ${p}`)
        return files[p]!
      },
      writeFile: async (p, c) => {
        files[p] = c
      },
      readdir: async () => []
    }
  }
  return { ctx, files }
}

const registry = createToolRegistry([...brainTools])

const run = (name: string, args: unknown, ctx: ToolContext) =>
  registry.execute({ id: 't1', name, args }, ctx)

describe('brain 工具', () => {
  it('四个工具已注册,写入工具为 safeWrite + previewable,读取为 read', () => {
    for (const name of [
      'brain_read',
      'brain_upsert_foreshadowing',
      'brain_upsert_relationship',
      'brain_set_knowledge'
    ]) {
      expect(registry.get(name)).toBeTruthy()
    }
    expect(registry.get('brain_read')!.risk).toBe<'read'>('read')
    expect(registry.get('brain_upsert_foreshadowing')!.risk).toBe<'safeWrite'>('safeWrite')
  })

  it('copilot 模式下写入工具需要确认,gate 分级正确', () => {
    const gate = createAutonomyGate('copilot')
    const risk = registry.get('brain_upsert_relationship')!.risk as ToolRisk
    expect(gate.decide(risk)).toBe('confirm')
  })

  it('brain_read 空项目返回空 brain', async () => {
    const { ctx } = makeCtx()
    const r = await run('brain_read', {}, ctx)
    expect(r.ok).toBe(true)
    expect(r.content).toContain('"foreshadowings": []')
  })

  it('登记伏笔 → brain_read 能读到', async () => {
    const { ctx } = makeCtx()
    const w = await run(
      'brain_upsert_foreshadowing',
      { id: 'f1', description: '怀表', status: 'planted', plantedInSceneId: 's1' },
      ctx
    )
    expect(w.ok).toBe(true)
    const r = await run('brain_read', { kind: 'foreshadowings' }, ctx)
    expect(r.content).toContain('怀表')
  })

  it('设置知识边界 → 按条件+事实更新', async () => {
    const { ctx } = makeCtx()
    await run('brain_set_knowledge', { id: 'k1', condition: 'route_b', fact: '身世', known: false }, ctx)
    await run('brain_set_knowledge', { id: 'k2', condition: 'route_b', fact: '身世', known: true }, ctx)
    const r = await run('brain_read', { kind: 'knowledgeBoundaries' }, ctx)
    expect(r.content).not.toContain('k2')
    expect(r.content).toContain('"known": true')
  })

  it('写盘失败 → 显式失败结果', async () => {
    const ctx: ToolContext = {
      projectPath: '/proj',
      fs: {
        readFile: async () => {
          throw new Error('ENOENT')
        },
        writeFile: async () => {
          throw new Error('disk full')
        },
        readdir: async () => []
      }
    }
    const r = await run('brain_upsert_foreshadowing', { id: 'f1', description: 'x', status: 'planted' }, ctx)
    expect(r.ok).toBe(false)
    expect(r.content).toContain('disk full')
  })
})
