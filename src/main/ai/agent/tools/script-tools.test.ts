/**
 * script-tools 单测 — 只读 + 安全写工具
 *
 * 只读(list_scenes/read_script/find_node)用 memfs fixture;
 * 安全写(create_scene/add_dialogue)断言 serialize 后 .gal 内容。
 * Mock 边界:磁盘 memfs(禁止 mock fs)。
 */
import { describe, it, expect } from 'vitest'
import { createFsFromVolume, Volume } from 'memfs'
import { scriptTools } from './script-tools.js'
import { createToolRegistry } from '../tool-registry.js'
import type { ToolContext, ToolFs } from '../types.js'

const chapter1 = `## intro
背景: classroom
小雪: "你好"

## hallway
背景: corridor
阳: "走吧"
`

const makeCtx = (): { ctx: ToolContext; fs: ToolFs; read: (f: string) => string } => {
  const vol = Volume.fromJSON({ '/proj/chapter1.gal': chapter1 })
  const mfs = createFsFromVolume(vol)
  const fs: ToolFs = {
    readFile: (p) => mfs.promises.readFile(p, 'utf-8') as Promise<string>,
    writeFile: (p, c) => mfs.promises.writeFile(p, c) as Promise<void>,
    readdir: (p) => mfs.promises.readdir(p) as Promise<string[]>
  }
  return {
    ctx: { projectPath: '/proj', fs },
    fs,
    read: (f) => mfs.readFileSync(`/proj/${f}`, 'utf-8') as string
  }
}

const reg = createToolRegistry(scriptTools)

describe('script-tools — 只读', () => {
  it('list_scenes 列出场景', async () => {
    const { ctx } = makeCtx()
    const r = await reg.execute({ id: '1', name: 'list_scenes', args: {} }, ctx)
    expect(r.ok).toBe(true)
    expect(r.content).toContain('intro')
    expect(r.content).toContain('hallway')
  })

  it('read_script 返回源文件内容', async () => {
    const { ctx } = makeCtx()
    const r = await reg.execute({ id: '1', name: 'read_script', args: { fileName: 'chapter1.gal' } }, ctx)
    expect(r.ok).toBe(true)
    expect(r.content).toContain('小雪')
  })

  it('find_node 按 id 找到场景', async () => {
    const { ctx } = makeCtx()
    const r = await reg.execute(
      { id: '1', name: 'find_node', args: { fileName: 'chapter1.gal', id: 'hallway' } },
      ctx
    )
    expect(r.ok).toBe(true)
    expect(r.content).toContain('hallway')
  })

  it('find_node 找不到 → ok=false', async () => {
    const { ctx } = makeCtx()
    const r = await reg.execute(
      { id: '1', name: 'find_node', args: { fileName: 'chapter1.gal', id: 'ghost' } },
      ctx
    )
    expect(r.ok).toBe(false)
  })

  it('read_script 非法 fileName 被 schema 拒绝', async () => {
    const { ctx } = makeCtx()
    const r = await reg.execute({ id: '1', name: 'read_script', args: { fileName: '../etc/passwd' } }, ctx)
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('SCHEMA_FAILED')
  })
})

describe('script-tools — 安全写', () => {
  it('create_scene 把新场景写盘(serialize 后含 ## 场景头)', async () => {
    const { ctx, read } = makeCtx()
    const r = await reg.execute(
      {
        id: '1',
        name: 'create_scene',
        args: { fileName: 'chapter1.gal', sceneId: 'rooftop', background: 'sky' }
      },
      ctx
    )
    expect(r.ok).toBe(true)
    const out = read('chapter1.gal')
    expect(out).toContain('## rooftop')
    expect(out).toContain('背景: sky')
    // 旧场景保留
    expect(out).toContain('## intro')
  })

  it('add_dialogue 追加对白(serialize 后含 角色: "文本")', async () => {
    const { ctx, read } = makeCtx()
    const r = await reg.execute(
      {
        id: '1',
        name: 'add_dialogue',
        args: { fileName: 'chapter1.gal', sceneId: 'intro', character: '小雪', text: '再见了' }
      },
      ctx
    )
    expect(r.ok).toBe(true)
    const out = read('chapter1.gal')
    expect(out).toContain('小雪: "再见了"')
  })

  it('add_dialogue 目标场景不存在 → ok=false', async () => {
    const { ctx } = makeCtx()
    const r = await reg.execute(
      {
        id: '1',
        name: 'add_dialogue',
        args: { fileName: 'chapter1.gal', sceneId: 'ghost', character: '小雪', text: 'x' }
      },
      ctx
    )
    expect(r.ok).toBe(false)
  })

  it('create_scene 标注 risk=safeWrite,read_script 标注 risk=read', () => {
    expect(reg.get('create_scene')?.risk).toBe('safeWrite')
    expect(reg.get('read_script')?.risk).toBe('read')
  })
})
