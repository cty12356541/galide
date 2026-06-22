/**
 * Ink Composer — gal AST → .ink 脚本
 */
import { describe, it, expect } from 'vitest'
import { parse } from '../../shared/dsl/parser.js'
import { InkComposer, sanitizeInkKnot, buildInkSpriteDeclLines } from './ink-composer.js'
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

const makeChoice = (options: ChoiceNode['options']): ChoiceNode => ({
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

const makeScene = (
  id: string,
  children: SceneNode['children'],
  meta?: Pick<SceneNode, 'background' | 'bgm'>
): SceneNode => ({
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

const makeCtx = (asts: AstEntry[]): ExportContext => ({
  request: { projectPath: '/p', target: 'ink', outputPath: '/tmp/out' },
  asts,
  outputDir: '/tmp/out',
  progress: () => {}
})

describe('sanitizeInkKnot', () => {
  it('replaces middle dot and spaces with underscore', () => {
    expect(sanitizeInkKnot('教室·午后')).toBe('教室_午后')
  })

  it('prefixes numeric-leading ids', () => {
    expect(sanitizeInkKnot('123scene')).toBe('k_123scene')
  })

  it('deduplicates via buildKnotMap when ids collide after sanitize', async () => {
    const ast = makeAst([
      makeScene('a-b', [makeDialogue('A', 'one')]),
      makeScene('a_b', [makeDialogue('B', 'two')])
    ])
    const ctx = makeCtx([{ file: 'main.gal', ast }])
    const composer = new InkComposer()
    const target = await composer.transform(ctx)
    const ink = composer.emit(target, ctx)
    expect(ink).toContain('=== a_b ===')
    expect(ink).toContain('=== a_b_2 ===')
  })
})

describe('InkComposer', () => {
  it('emits knot and dialogue with character tag', async () => {
    const ast = makeAst([makeScene('教室', [makeDialogue('小雪', '你好')])])
    const ctx = makeCtx([{ file: 'main.gal', ast }])
    const composer = new InkComposer()
    const target = await composer.transform(ctx)
    const ink = composer.emit(target, ctx)
    expect(ink).toContain('=== 教室 ===')
    expect(ink).toContain('小雪: 你好')
    expect(ink).toContain('EXTERNAL showCharacter')
  })

  it('emits showCharacter for dialogue with sprite', async () => {
    const dialogue: DialogueNode = {
      ...base(1),
      type: 'dialogue',
      character: '小雪',
      sprite: '默认',
      position: 'left',
      lines: ['你好']
    }
    const ast = makeAst([makeScene('教室', [dialogue])])
    const ctx = makeCtx([{ file: 'main.gal', ast }])
    const composer = new InkComposer()
    const target = await composer.transform(ctx)
    const ink = composer.emit(target, ctx)
    expect(ink).toContain('~ showCharacter("小雪", "默认", "left")')
  })

  it('buildInkSpriteDeclLines lists manifest sprites', () => {
    const lines = buildInkSpriteDeclLines([
      {
        id: 'koyuki',
        name: '小雪',
        spriteSet: [{ state: '默认', path: 'assets/characters/koyuki.png' }]
      }
    ])
    expect(lines.some((l) => l.includes('IMAGE:') && l.includes('koyuki.png'))).toBe(true)
  })

  it('emits background and BGM as comments', async () => {
    const ast = makeAst([
      makeScene('开场', [makeDialogue('旁白', '开始')], {
        background: 'assets/backgrounds/classroom.png',
        bgm: 'assets/bgm/piano.mp3'
      })
    ])
    const ctx = makeCtx([{ file: 'main.gal', ast }])
    const composer = new InkComposer()
    const target = await composer.transform(ctx)
    const ink = composer.emit(target, ctx)
    expect(ink).toContain('// background: assets/backgrounds/classroom.png')
    expect(ink).toContain('// bgm: assets/bgm/piano.mp3')
  })

  it('emits VAR block and set statements', async () => {
    const ast = makeAst([
      makeScene('s1', [
        makeSet('affinity', 'set', { kind: 'literal', value: 10 }),
        makeSet('affinity', 'add', { kind: 'literal', value: 5 }),
        makeSet('flag', 'set', { kind: 'literal', value: true })
      ])
    ])
    const ctx = makeCtx([{ file: 'main.gal', ast }])
    const composer = new InkComposer()
    const target = await composer.transform(ctx)
    const ink = composer.emit(target, ctx)
    expect(ink).toContain('VAR affinity = 0')
    expect(ink).toContain('VAR flag = false')
    expect(ink).toContain('~ affinity = 10')
    expect(ink).toContain('~ affinity += 5')
    expect(ink).toContain('~ flag = true')
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
    const composer = new InkComposer()
    const target = await composer.transform(ctx)
    const ink = composer.emit(target, ctx)
    expect(ink).toContain('- affinity >= 10:')
    expect(ink).toContain('- affinity >= 5:')
    expect(ink).toContain('- else:')
    expect(ink).toContain('小雪: 高好感')
  })

  it('emits choices with conditional gate', async () => {
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
    const composer = new InkComposer()
    const target = await composer.transform(ctx)
    const ink = composer.emit(target, ctx)
    expect(ink).toContain('* [普通选项]')
    expect(ink).toContain('-> s2')
    expect(ink).toContain('* {affinity >= 10} [秘密路线]')
    expect(ink).toContain('-> 结局A')
  })

  it('emits marker knot and goto divert', async () => {
    const ast = makeAst([
      makeScene('s1', [
        makeDialogue('A', 'hi'),
        makeMarker('checkpoint'),
        makeGoto('s2')
      ]),
      makeScene('s2', [makeDialogue('B', 'dest')])
    ])
    const ctx = makeCtx([{ file: 'main.gal', ast }])
    const composer = new InkComposer()
    const target = await composer.transform(ctx)
    const ink = composer.emit(target, ctx)
    expect(ink).toContain('=== checkpoint ===')
    expect(ink).toContain('-> s2')
  })

  it('parses sample .gal and emits coherent ink', async () => {
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
    const composer = new InkComposer()
    const target = await composer.transform(ctx)
    const ink = composer.emit(target, ctx)
    expect(ink).toContain('=== 教室_午后 ===')
    expect(ink).toContain('小雪: 今天的樱花,真漂亮呢。')
    expect(ink).toContain('* [邀请她一起看樱花]')
    expect(ink).toContain('-> 樱花树下')
    expect(ink).toContain('* {affinity >= 10} [秘密路线]')
    expect(ink).toContain('=== 樱花树下 ===')
  })

  it('does not throw NOT_IMPLEMENTED', async () => {
    const ast = makeAst([makeScene('s1', [makeDialogue('A', 'hi')])])
    const ctx = makeCtx([{ file: 'a.gal', ast }])
    const composer = new InkComposer()
    const target = await composer.transform(ctx)
    expect(() => composer.emit(target, ctx)).not.toThrow()
  })
})
