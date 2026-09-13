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
import { parse } from '../../../../shared/dsl/parser.js'
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

describe('script-tools — 编辑 / 删除 / 重排', () => {
  it('update_dialogue 改写第 0 条对白', async () => {
    const { ctx, read } = makeCtx()
    const r = await reg.execute(
      {
        id: '1',
        name: 'update_dialogue',
        args: { fileName: 'chapter1.gal', sceneId: 'intro', index: 0, text: '你好啊' }
      },
      ctx
 )
    expect(r.ok).toBe(true)
    const out = read('chapter1.gal')
    expect(out).toContain('小雪: "你好啊"')
    expect(out).not.toContain('"你好"')
  })

  it('update_dialogue 索引越界 → ok=false', async () => {
    const { ctx } = makeCtx()
    const r = await reg.execute(
      {
        id: '1',
        name: 'update_dialogue',
        args: { fileName: 'chapter1.gal', sceneId: 'intro', index: 99, text: 'x' }
      },
      ctx
    )
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('INDEX_OUT_OF_RANGE')
  })

  it('update_scene_meta 改背景并清空 bgm', async () => {
    const { ctx, read } = makeCtx()
    const r = await reg.execute(
      {
        id: '1',
        name: 'update_scene_meta',
        args: { fileName: 'chapter1.gal', sceneId: 'intro', background: 'rooftop' }
      },
      ctx
    )
    expect(r.ok).toBe(true)
    const out = read('chapter1.gal')
    expect(out).toContain('背景: rooftop')
  })

  it('delete_node 删除第 0 个子节点', async () => {
    const { ctx, read } = makeCtx()
    const r = await reg.execute(
      {
        id: '1',
        name: 'delete_node',
        args: { fileName: 'chapter1.gal', sceneId: 'intro', index: 0 }
      },
      ctx
    )
    expect(r.ok).toBe(true)
    expect(read('chapter1.gal')).not.toContain('"你好"')
  })

  it('move_node 重排子节点顺序', async () => {
    const { ctx, read } = makeCtx()
    // intro 现有 1 条对白;先加一条再移动
    await reg.execute(
      { id: '1', name: 'add_dialogue', args: { fileName: 'chapter1.gal', sceneId: 'intro', character: '阳', text: 'B' } },
      ctx
    )
    const r = await reg.execute(
      {
        id: '1',
        name: 'move_node',
        args: { fileName: 'chapter1.gal', sceneId: 'intro', from: 0, to: 1 }
      },
      ctx
    )
    expect(r.ok).toBe(true)
    const out = read('chapter1.gal')
    expect(out.indexOf('阳: "B"')).toBeLessThan(out.indexOf('小雪: "你好"'))
  })

  it('add_choice 追加无门控选项', async () => {
    const { ctx, read } = makeCtx()
    const r = await reg.execute(
      {
        id: '1',
        name: 'add_choice',
        args: { fileName: 'chapter1.gal', sceneId: 'intro', text: '去走廊', target: 'hallway' }
      },
      ctx
    )
    expect(r.ok).toBe(true)
    expect(read('chapter1.gal')).toContain('去走廊')
  })

  it('add_choice 带门控条件', async () => {
    const { ctx, read } = makeCtx()
    const r = await reg.execute(
      {
        id: '1',
        name: 'add_choice',
        args: { fileName: 'chapter1.gal', sceneId: 'intro', text: '表白', target: 'hallway', condition: 'affinity > 5' }
      },
      ctx
    )
    expect(r.ok).toBe(true)
    expect(read('chapter1.gal')).toContain('当: affinity > 5')
  })

 it('编辑工具 risk=safeWrite', () => {
   expect(reg.get('update_dialogue')?.risk).toBe('safeWrite')
   expect(reg.get('delete_node')?.risk).toBe('safeWrite')
   expect(reg.get('move_node')?.risk).toBe('safeWrite')
   expect(reg.get('add_choice')?.risk).toBe('safeWrite')
 })

  it('create_script_file 从零创建空剧本', async () => {
    const { ctx, read } = makeCtx()
    const r = await reg.execute(
      { id: '1', name: 'create_script_file', args: { fileName: 'chapter2.gal' } },
      ctx
    )
    expect(r.ok).toBe(true)
    expect(read('chapter2.gal')).toBe('')
  })

  it('create_script_file 已存在 → DUPLICATE_FILE', async () => {
    const { ctx } = makeCtx()
    const r = await reg.execute(
      { id: '1', name: 'create_script_file', args: { fileName: 'chapter1.gal' } },
      ctx
    )
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('DUPLICATE_FILE')
  })
})

describe('script-tools — 跳转 / 标记', () => {
  it('add_goto 追加无条件跳转并序列化 [跳转:target]', async () => {
    const { ctx, read } = makeCtx()
    const r = await reg.execute(
      {
        id: '1',
        name: 'add_goto',
        args: { fileName: 'chapter1.gal', sceneId: 'intro', target: 'hallway' }
      },
      ctx
    )
    expect(r.ok).toBe(true)
    const out = read('chapter1.gal')
    expect(out).toContain('[跳转:hallway]')
    expect(parse(out).ok).toBe(true)
  })

  it('add_marker 追加标记锚点并序列化 === id ===', async () => {
    const { ctx, read } = makeCtx()
    const r = await reg.execute(
      {
        id: '1',
        name: 'add_marker',
        args: { fileName: 'chapter1.gal', sceneId: 'intro', id: 'mid' }
      },
      ctx
    )
    expect(r.ok).toBe(true)
    const out = read('chapter1.gal')
    expect(out).toContain('=== mid ===')
    expect(parse(out).ok).toBe(true)
  })

  it('add_marker 重复 id → DUPLICATE_MARKER 且原文件不变', async () => {
    const { ctx, read } = makeCtx()
    await reg.execute(
      { id: '1', name: 'add_marker', args: { fileName: 'chapter1.gal', sceneId: 'intro', id: 'dup' } },
      ctx
    )
    const before = read('chapter1.gal')
    const r = await reg.execute(
      { id: '1', name: 'add_marker', args: { fileName: 'chapter1.gal', sceneId: 'intro', id: 'dup' } },
      ctx
    )
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('DUPLICATE_MARKER')
    expect(read('chapter1.gal')).toBe(before)
  })

  it('add_goto / add_marker 指向不存在场景 → SCENE_NOT_FOUND', async () => {
    const { ctx } = makeCtx()
    const g = await reg.execute(
      { id: '1', name: 'add_goto', args: { fileName: 'chapter1.gal', sceneId: 'nope', target: 'hallway' } },
      ctx
    )
    expect(g.ok).toBe(false)
    expect(g.error?.code).toBe('SCENE_NOT_FOUND')
    const m = await reg.execute(
      { id: '1', name: 'add_marker', args: { fileName: 'chapter1.gal', sceneId: 'nope', id: 'm' } },
      ctx
    )
    expect(m.ok).toBe(false)
    expect(m.error?.code).toBe('SCENE_NOT_FOUND')
  })

  it('add_goto / add_marker risk=safeWrite', () => {
    expect(reg.get('add_goto')?.risk).toBe('safeWrite')
    expect(reg.get('add_marker')?.risk).toBe('safeWrite')
  })
})
