/**
 * Ren'Py Composer — gal AST → .rpy 脚本
 */
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from '../../shared/dsl/parser.js'
import { RenpyComposer } from './renpy-composer.js'
import type {
  ScriptNode,
  SceneNode,
  DialogueNode,
  ChoiceNode,
  GotoNode,
  MarkerNode,
  SetNode,
  IfNode,
  BaseNode
} from '../../shared/dsl/types.js'
import type { ExportContext, AstEntry } from './composer.js'

const base = (line: number): BaseNode => ({ line, column: 1 })

const makeDialogue = (character: string, text: string): DialogueNode => ({
  ...base(1),
  type: 'dialogue',
  character,
  lines: [text]
})

const makeChoice = (
  options: ChoiceNode['options']
): ChoiceNode => ({
  ...base(1),
  type: 'choice',
  options
})

const makeGoto = (target: string): GotoNode => ({
  ...base(1),
  type: 'goto',
  target
})

const makeMarker = (id: string): MarkerNode => ({
  ...base(1),
  type: 'marker',
  id
})

const makeSet = (name: string, op: SetNode['op'], value: SetNode['value']): SetNode => ({
  ...base(1),
  type: 'set',
  name,
  op,
  value
})

const makeIf = (branches: IfNode['branches']): IfNode => ({
  ...base(1),
  type: 'if',
  branches
})

const makeScene = (id: string, children: SceneNode['children'], meta?: Pick<SceneNode, 'background' | 'bgm'>): SceneNode => ({
  ...base(1),
  type: 'scene',
  id,
  children,
  ...meta
})

const makeAst = (scenes: SceneNode[]): ScriptNode => ({
  ...base(1),
  type: 'script',
  children: scenes,
  errors: []
})

const tmpRoot = mkdtempSync(join(tmpdir(), 'galide-renpy-'))

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

const makeCtx = (asts: AstEntry[]): ExportContext => ({
  request: { projectPath: join(tmpRoot, 'project'), target: 'renpy', outputPath: join(tmpRoot, 'out') },
  asts,
  outputDir: join(tmpRoot, 'out'),
  progress: () => {}
})

describe('RenpyComposer', () => {
  it('emits scene label and dialogue', async () => {
    const ast = makeAst([makeScene('教室', [makeDialogue('小雪', '你好')])])
    const ctx = makeCtx([{ file: 'main.gal', ast }])
    const composer = new RenpyComposer()
    const target = await composer.transform(ctx)
    const out = composer.emit(target, ctx)
    expect(out.kind).toBe('multi')
    if (out.kind !== 'multi') return
    const script = out.files.find((f) => f.path === 'game/script.rpy')?.content ?? ''
    expect(script).toContain('label 教室:')
    expect(script).toContain('"小雪" "你好"')
  })

  it('emits background and BGM', async () => {
    const ast = makeAst([
      makeScene('开场', [makeDialogue('旁白', '开始')], {
        background: 'assets/backgrounds/classroom.png',
        bgm: 'assets/bgm/piano.mp3'
      })
    ])
    const ctx = makeCtx([{ file: 'main.gal', ast }])
    const composer = new RenpyComposer()
    const target = await composer.transform(ctx)
    const out = composer.emit(target, ctx)
    if (out.kind !== 'multi') return
    const script = out.files.find((f) => f.path === 'game/script.rpy')?.content ?? ''
    expect(script).toContain('scene expression "assets/backgrounds/classroom.png"')
    expect(script).toContain('play music "assets/bgm/piano.mp3"')
  })

  it('emits set statements', async () => {
    const ast = makeAst([
      makeScene('s1', [
        makeSet('affinity', 'set', { kind: 'literal', value: 10 }),
        makeSet('affinity', 'add', { kind: 'literal', value: 5 }),
        makeSet('affinity', 'sub', { kind: 'literal', value: 2 })
      ])
    ])
    const ctx = makeCtx([{ file: 'main.gal', ast }])
    const composer = new RenpyComposer()
    const target = await composer.transform(ctx)
    const out = composer.emit(target, ctx)
    if (out.kind !== 'multi') return
    const script = out.files.find((f) => f.path === 'game/script.rpy')?.content ?? ''
    expect(script).toContain('$ affinity = 10')
    expect(script).toContain('$ affinity += 5')
    expect(script).toContain('$ affinity -= 2')
  })

  it('emits if/elif/else blocks', async () => {
    const ast = makeAst([
      makeScene('s1', [
        makeIf([
          {
            kind: 'if',
            condition: {
              kind: 'binary',
              op: 'ge',
              left: { kind: 'var', name: 'affinity' },
              right: { kind: 'literal', value: 10 }
            },
            children: [makeDialogue('小雪', '高好感')]
          },
          {
            kind: 'elif',
            condition: {
              kind: 'binary',
              op: 'ge',
              left: { kind: 'var', name: 'affinity' },
              right: { kind: 'literal', value: 5 }
            },
            children: [makeDialogue('小雪', '中好感')]
          },
          { kind: 'else', children: [makeDialogue('小雪', '低好感')] }
        ])
      ])
    ])
    const ctx = makeCtx([{ file: 'main.gal', ast }])
    const composer = new RenpyComposer()
    const target = await composer.transform(ctx)
    const out = composer.emit(target, ctx)
    if (out.kind !== 'multi') return
    const script = out.files.find((f) => f.path === 'game/script.rpy')?.content ?? ''
    expect(script).toContain('if affinity >= 10:')
    expect(script).toContain('elif affinity >= 5:')
    expect(script).toContain('else:')
    expect(script).toContain('"小雪" "高好感"')
  })

  it('emits menu with conditional choice', async () => {
    const ast = makeAst([
      makeScene('s1', [
        makeChoice([
          { text: '普通选项', target: 's2' },
          {
            text: '秘密路线',
            target: '结局A',
            condition: {
              kind: 'binary',
              op: 'ge',
              left: { kind: 'var', name: 'affinity' },
              right: { kind: 'literal', value: 10 }
            }
          }
        ])
      ]),
      makeScene('s2', [makeDialogue('A', 'dest')]),
      makeScene('结局A', [makeDialogue('A', 'secret')])
    ])
    const ctx = makeCtx([{ file: 'main.gal', ast }])
    const composer = new RenpyComposer()
    const target = await composer.transform(ctx)
    const out = composer.emit(target, ctx)
    if (out.kind !== 'multi') return
    const script = out.files.find((f) => f.path === 'game/script.rpy')?.content ?? ''
    expect(script).toContain('menu:')
    expect(script).toContain('"普通选项":')
    expect(script).toContain('jump s2')
    expect(script).toContain('"秘密路线" if affinity >= 10:')
    expect(script).toContain('jump 结局A')
  })

  it('emits marker label and goto jump', async () => {
    const ast = makeAst([
      makeScene('s1', [
        makeDialogue('A', 'hi'),
        makeMarker('checkpoint'),
        makeGoto('s2')
      ]),
      makeScene('s2', [makeDialogue('B', 'dest')])
    ])
    const ctx = makeCtx([{ file: 'main.gal', ast }])
    const composer = new RenpyComposer()
    const target = await composer.transform(ctx)
    const out = composer.emit(target, ctx)
    if (out.kind !== 'multi') return
    const script = out.files.find((f) => f.path === 'game/script.rpy')?.content ?? ''
    expect(script).toContain('label checkpoint:')
    expect(script).toContain('jump s2')
  })

  it('parses sample .gal and emits coherent script', async () => {
    const src = `## 教室·午后
背景: assets/backgrounds/classroom.png
BGM: assets/bgm/gentle_piano.mp3

小雪: "今天的樱花,真漂亮呢。"
* "邀请她一起看樱花" -> 樱花树下
* "秘密路线" -> 结局A [当: affinity >= 10]

## 樱花树下
小雪: "诶?!一起吗?"
`
    const result = parse(src)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const ctx = makeCtx([{ file: 'main.gal', ast: result.value }])
    const composer = new RenpyComposer()
    const target = await composer.transform(ctx)
    const out = composer.emit(target, ctx)
    if (out.kind !== 'multi') return
    const script = out.files.find((f) => f.path === 'game/script.rpy')?.content ?? ''
    expect(script).toContain('label 教室_午后:')
    expect(script).toContain('"小雪" "今天的樱花,真漂亮呢。"')
    expect(script).toContain('menu:')
    expect(script).toContain('jump 樱花树下')
    expect(script).toContain('"秘密路线" if affinity >= 10:')
    expect(script).toContain('label 樱花树下:')
  })

  it('emits characters.rpy with define statements', async () => {
    const ast = makeAst([
      makeScene('s1', [makeDialogue('小雪', '你好'), makeDialogue('主角', '嗯')])
    ])
    const ctx = makeCtx([{ file: 'main.gal', ast }])
    const composer = new RenpyComposer()
    const target = await composer.transform(ctx)
    const out = composer.emit(target, ctx)
    if (out.kind !== 'multi') return
    const chars = out.files.find((f) => f.path === 'game/characters.rpy')?.content ?? ''
    expect(chars).toContain('define ')
    expect(chars).toContain('Character("小雪"')
    expect(chars).toContain('Character("主角"')
  })

  it('does not throw NOT_IMPLEMENTED', async () => {
    const ast = makeAst([makeScene('s1', [makeDialogue('A', 'hi')])])
    const ctx = makeCtx([{ file: 'a.gal', ast }])
    const composer = new RenpyComposer()
    const target = await composer.transform(ctx)
    expect(() => composer.emit(target, ctx)).not.toThrow()
  })
})
