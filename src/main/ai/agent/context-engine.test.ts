/**
 * context-engine 单测 — 组装 agent 上下文
 *
 * 注入:角色表(.galproj)+ 场景索引(多 .gal)+ 选中节点 + git diff,带 token 预算。
 * Mock 边界(testing-conventions):磁盘用 memfs(禁止 mock fs);git 用 mock。
 */
import { describe, it, expect } from 'vitest'
import { createFsFromVolume, Volume } from 'memfs'
import { buildContext, estimateTokens, type ContextFs, type ContextGit } from './context-engine.js'

const manifest = {
  version: '0.1.0',
  name: 'demo',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  characters: [
    { id: 'koyuki', name: '小雪', description: '转学生', personality: '文静温柔', spriteSet: [] },
    { id: 'haru', name: '阳', description: '青梅竹马', personality: '开朗', spriteSet: [] }
  ],
  assets: { characters: 'assets/characters', backgrounds: 'assets/backgrounds', bgm: 'assets/bgm' }
}

const chapter1 = `## intro
背景: classroom
小雪: "你好"

## hallway
背景: corridor
阳: "走吧"
`

const chapter2 = `## rooftop
背景: sky
小雪: "风好大"
`

const makeFs = (): ContextFs => {
  const vol = Volume.fromJSON({
    '/proj/.galproj': JSON.stringify(manifest),
    '/proj/scripts/chapter1.gal': chapter1,
    '/proj/scripts/chapter2.gal': chapter2
  })
  const mfs = createFsFromVolume(vol)
  return {
    readFile: (p: string) => mfs.promises.readFile(p, 'utf-8') as Promise<string>,
    readdir: (p: string) => mfs.promises.readdir(p) as Promise<string[]>
  }
}

const noGit: ContextGit = { diff: async () => ({ ok: true, value: '' }) }

describe('context-engine', () => {
  it('注入角色表(名字 + 性格)', async () => {
    const ctx = await buildContext({ projectPath: '/proj' }, { fs: makeFs(), git: noGit })
    expect(ctx.characters).toHaveLength(2)
    expect(ctx.text).toContain('小雪')
    expect(ctx.text).toContain('文静温柔')
  })

  it('注入跨文件场景索引', async () => {
    const ctx = await buildContext({ projectPath: '/proj' }, { fs: makeFs(), git: noGit })
    const ids = ctx.scenes.map((s) => s.id)
    expect(ids).toContain('intro')
    expect(ids).toContain('hallway')
    expect(ids).toContain('rooftop')
    // 场景索引应带来源文件名
    expect(ctx.scenes.find((s) => s.id === 'rooftop')?.fileName).toBe('chapter2.gal')
  })

  it('给定 selectedSceneId 时注入该场景明细', async () => {
    const ctx = await buildContext(
      { projectPath: '/proj', selectedSceneId: 'intro' },
      { fs: makeFs(), git: noGit }
    )
    expect(ctx.selectedScene?.id).toBe('intro')
    expect(ctx.text).toContain('当前选中场景')
    expect(ctx.text).toContain('intro')
  })

  it('注入 git diff', async () => {
    const git: ContextGit = {
      diff: async () => ({ ok: true, value: '+ 小雪: "新增一行"' })
    }
    const ctx = await buildContext({ projectPath: '/proj' }, { fs: makeFs(), git })
    expect(ctx.gitDiff).toContain('新增一行')
    expect(ctx.text).toContain('新增一行')
  })

  it('遵守 token 预算:超预算则截断且标记 truncated', async () => {
    const git: ContextGit = {
      diff: async () => ({ ok: true, value: 'x'.repeat(5000) })
    }
    const ctx = await buildContext(
      { projectPath: '/proj', tokenBudget: 50 },
      { fs: makeFs(), git }
    )
    expect(estimateTokens(ctx.text)).toBeLessThanOrEqual(50)
    expect(ctx.truncated).toBe(true)
  })

 it('estimateTokens 近似按字符数 /4', () => {
   expect(estimateTokens('abcd')).toBe(1)
   expect(estimateTokens('')).toBe(0)
 })

  it('memoryText 注入"先前会话"段(最低优先级,超预算先截断)', async () => {
    const git: ContextGit = { diff: async () => ({ ok: true, value: '' }) }
    const ctx = await buildContext(
      { projectPath: '/proj', memoryText: '[done] 加场景 → 已完成' },
      { fs: makeFs(), git }
    )
    expect(ctx.text).toContain('先前会话')
    expect(ctx.text).toContain('加场景')
  })
})
