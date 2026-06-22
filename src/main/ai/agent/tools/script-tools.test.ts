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
  const vol = Volume.fromJSON({ '/proj/scripts/chapter1.gal': chapter1 })
  const mfs = createFsFromVolume(vol)
  const fs: ToolFs = {
    readFile: (p) => mfs.promises.readFile(p, 'utf-8') as Promise<string>,
    writeFile: (p, c) => mfs.promises.writeFile(p, c) as Promise<void>,
    readdir: (p) => mfs.promises.readdir(p) as Promise<string[]>
  }
  return {
    ctx: { projectPath: '/proj', fs },
    fs,
    read: (f) => mfs.readFileSync(`/proj/scripts/${f}`, 'utf-8') as string
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

describe('script-tools — 变量/条件', () => {
  const varGal = `## intro
设: affinity = 0
小雪: "你好"
`

  it('set_variable 追加设: 行', async () => {
    const { ctx, read } = makeCtx()
    const r = await reg.execute(
      {
        id: '1',
        name: 'set_variable',
        args: { fileName: 'chapter1.gal', sceneId: 'intro', name: 'affinity', op: 'add', value: '5' }
      },
      ctx
    )
    expect(r.ok).toBe(true)
    const out = read('chapter1.gal')
    expect(out).toContain('设: affinity += 5')
  })

  it('add_conditional_block 插入 [若:] 块', async () => {
    const { ctx, read } = makeCtx()
    const r = await reg.execute(
      {
        id: '1',
        name: 'add_conditional_block',
        args: {
          fileName: 'chapter1.gal',
          sceneId: 'intro',
          condition: 'affinity >= 10',
          ifDialogue: { character: '小雪', text: '高好感' },
          elseDialogue: { character: '小雪', text: '低好感' }
        }
      },
      ctx
    )
    expect(r.ok).toBe(true)
    const out = read('chapter1.gal')
    expect(out).toContain('[若: affinity >= 10]')
    expect(out).toContain('[否则]')
    expect(out).toContain('[若终]')
    expect(out).toContain('高好感')
  })

  it('add_gated_choice 追加带 [当:] 的选项', async () => {
    const { ctx, read } = makeCtx()
    const r = await reg.execute(
      {
        id: '1',
        name: 'add_gated_choice',
        args: {
          fileName: 'chapter1.gal',
          sceneId: 'intro',
          text: '秘密路线',
          target: 'secret',
          condition: 'affinity >= 10'
        }
      },
      ctx
    )
    expect(r.ok).toBe(true)
    const out = read('chapter1.gal')
    expect(out).toContain('[当: affinity >= 10]')
    expect(out).toContain('秘密路线')
  })

  it('read_variables 扫描变量与条件', async () => {
    const vol = Volume.fromJSON({ '/proj/scripts/chapter1.gal': varGal })
    const mfs = createFsFromVolume(vol)
    const fs: ToolFs = {
      readFile: (p) => mfs.promises.readFile(p, 'utf-8') as Promise<string>,
      writeFile: (p, c) => mfs.promises.writeFile(p, c) as Promise<void>,
      readdir: (p) => mfs.promises.readdir(p) as Promise<string[]>
    }
    const ctx: ToolContext = { projectPath: '/proj', fs }
    const r = await reg.execute({ id: '1', name: 'read_variables', args: { fileName: 'chapter1.gal' } }, ctx)
    expect(r.ok).toBe(true)
    expect(r.content).toContain('affinity')
  })

  it('set_variable 非法 op 被 schema 拒绝', async () => {
    const { ctx } = makeCtx()
    const r = await reg.execute(
      {
        id: '1',
        name: 'set_variable',
        args: { fileName: 'chapter1.gal', sceneId: 'intro', name: 'x', op: 'mul', value: '1' }
      },
      ctx
    )
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('SCHEMA_FAILED')
  })

  it('add_conditional_block 无效条件表达式 → ok=false', async () => {
    const { ctx } = makeCtx()
    const r = await reg.execute(
      {
        id: '1',
        name: 'add_conditional_block',
        args: { fileName: 'chapter1.gal', sceneId: 'intro', condition: '!!!' }
      },
      ctx
    )
    expect(r.ok).toBe(false)
  })
})
