/**
 * manifest-tools 单测 — 角色 CRUD(经 patchGalproj 原子读写)
 * 磁盘用 memfs(禁止 mock fs)。
 */
import { describe, it, expect } from 'vitest'
import { createFsFromVolume, Volume } from 'memfs'
import { manifestTools } from './manifest-tools.js'
import { createToolRegistry } from '../tool-registry.js'
import type { ToolContext, ToolFs } from '../types.js'
import type { ProjectManifest } from '../../../../shared/types.js'

const emptyManifest: ProjectManifest = {
  version: '0.1.0',
  name: 'p',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  characters: [],
  assets: { characters: 'a', backgrounds: 'b', bgm: 'c' },
  git: { initialized: false }
}

const makeCtx = (manifest: ProjectManifest = emptyManifest): { ctx: ToolContext; read: () => ProjectManifest } => {
  const vol = Volume.fromJSON({ '/proj/.galproj': JSON.stringify(manifest) })
  const mfs = createFsFromVolume(vol)
  const fs: ToolFs = {
    readFile: (p) => mfs.promises.readFile(p, 'utf-8') as Promise<string>,
    writeFile: (p, c) => mfs.promises.writeFile(p, c) as Promise<void>,
    readdir: (p) => mfs.promises.readdir(p) as Promise<string[]>
  }
  return {
    ctx: { projectPath: '/proj', fs },
    read: () => JSON.parse(mfs.readFileSync('/proj/.galproj', 'utf-8') as string) as ProjectManifest
  }
}

const reg = createToolRegistry(manifestTools)

describe('manifest-tools — 角色 CRUD', () => {
  it('create_character 写入角色卡', async () => {
    const { ctx, read } = makeCtx()
    const r = await reg.execute(
      { id: '1', name: 'create_character', args: { id: 'koyuki', name: '小雪', description: '转学生', personality: '文静' } },
      ctx
    )
    expect(r.ok).toBe(true)
    expect(read().characters).toHaveLength(1)
    expect(read().characters[0]?.id).toBe('koyuki')
  })

  it('create_character 重复 id → DUPLICATE_CHARACTER', async () => {
    const { ctx } = makeCtx({ ...emptyManifest, characters: [{ id: 'koyuki', name: '小雪', description: 'd', personality: 'p', spriteSet: [] }] })
    const r = await reg.execute(
      { id: '1', name: 'create_character', args: { id: 'koyuki', name: '小雪', description: 'd', personality: 'p' } },
      ctx
    )
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('DUPLICATE_CHARACTER')
  })

  it('update_character 改名字', async () => {
    const { ctx, read } = makeCtx({ ...emptyManifest, characters: [{ id: 'koyuki', name: '小雪', description: 'd', personality: 'p', spriteSet: [] }] })
    const r = await reg.execute(
      { id: '1', name: 'update_character', args: { id: 'koyuki', name: '小雪改' } },
      ctx
    )
    expect(r.ok).toBe(true)
    expect(read().characters[0]?.name).toBe('小雪改')
  })

  it('update_character 不存在 → CHARACTER_NOT_FOUND', async () => {
    const { ctx } = makeCtx()
    const r = await reg.execute(
      { id: '1', name: 'update_character', args: { id: 'ghost', name: 'x' } },
      ctx
    )
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('CHARACTER_NOT_FOUND')
  })

  it('delete_character 删除角色', async () => {
    const { ctx, read } = makeCtx({ ...emptyManifest, characters: [{ id: 'koyuki', name: '小雪', description: 'd', personality: 'p', spriteSet: [] }] })
    const r = await reg.execute({ id: '1', name: 'delete_character', args: { id: 'koyuki' } }, ctx)
    expect(r.ok).toBe(true)
    expect(read().characters).toHaveLength(0)
  })

  it('list_characters 列出角色', async () => {
    const { ctx } = makeCtx({ ...emptyManifest, characters: [{ id: 'koyuki', name: '小雪', description: 'd', personality: '文静', spriteSet: [{ state: 'default', path: 'a.png' }] }] })
    const r = await reg.execute({ id: '1', name: 'list_characters', args: {} }, ctx)
    expect(r.ok).toBe(true)
    expect(r.content).toContain('小雪')
    expect(r.content).toContain('立绘 1 张')
  })

  it('list_characters 无角色 → (无角色)', async () => {
    const { ctx } = makeCtx()
    const r = await reg.execute({ id: '1', name: 'list_characters', args: {} }, ctx)
    expect(r.ok).toBe(true)
    expect(r.content).toBe('(无角色)')
  })

  it('风险标注:写工具 safeWrite,读工具 read', () => {
    expect(reg.get('create_character')?.risk).toBe('safeWrite')
    expect(reg.get('update_character')?.risk).toBe('safeWrite')
    expect(reg.get('delete_character')?.risk).toBe('safeWrite')
    expect(reg.get('list_characters')?.risk).toBe('read')
  })
})
