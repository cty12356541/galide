/**
 * Web Composer 测试 — 验证 Batch 3 重构:
 *  - 消费 ctx.asts(不再自行解析 .gal)
 *  - XSS 防护:用户文本经 JSON 转义 + 运行时 textContent(无 innerHTML 拼接)
 */
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebComposer } from './web-composer.js'
import type {
  ScriptNode,
  SceneNode,
  DialogueNode,
  BaseNode,
  ChoiceNode,
  GotoNode,
  MarkerNode
} from '../../shared/dsl/types.js'
import type { ExportContext, AstEntry } from './composer.js'
import {
  buildVmGraph,
  createVmState,
  jumpToTarget,
  buildPlayerRuntimeFunctions
} from '../../shared/preview/runtime-vm.js'

const base = (line: number): BaseNode => ({ line, column: 1 })

const makeDialogue = (character: string, text: string, sprite?: string, position?: 'left' | 'right' | 'center'): DialogueNode => ({
  ...base(1),
  type: 'dialogue',
  character,
  lines: [text],
  ...(sprite !== undefined ? { sprite } : {}),
  ...(position !== undefined ? { position } : {})
})

const makeChoice = (text: string, target: string): ChoiceNode => ({
  ...base(1),
  type: 'choice',
  options: [{ text, target }]
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

const makeScene = (id: string, children: SceneNode['children']): SceneNode => ({
  ...base(1),
  type: 'scene',
  id,
  children
})

const makeAst = (scenes: SceneNode[]): ScriptNode => ({
  ...base(1),
  type: 'script',
  children: scenes,
  errors: []
})

const tmpRoot = mkdtempSync(join(tmpdir(), 'galide-web-'))

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

const makeCtx = (asts: AstEntry[]): ExportContext => ({
  request: { projectPath: join(tmpRoot, 'project'), target: 'web', outputPath: join(tmpRoot, 'out') },
  asts,
  outputDir: join(tmpRoot, 'out'),
  progress: () => {}
})

describe('WebComposer (Batch 3)', () => {
  it('serializes ctx.asts scenes into the player graph (no parseScript)', async () => {
    const ast = makeAst([
      makeScene('s1', [
        makeDialogue('小雪', '你好'),
        makeChoice('去看樱花', 's2')
      ]),
      makeScene('s2', [makeDialogue('小雪', '到了')])
    ])
    const ctx = makeCtx([{ file: 'a.gal', ast }])
    const composer = new WebComposer()
    const target = await composer.transform(ctx)
    expect(target.html).toContain('"s1"')
    expect(target.html).toContain('"s2"')
    expect(target.html).toContain('你好')
    expect(target.html).toContain('去看樱花')
    expect(target.html).not.toContain('parseScript')
    expect(target.html).not.toContain('SCRIPTS')
    expect(target.html).toContain('VM_GRAPH')
  })

  it('XSS: dangerous dialogue text is JSON-escaped and not raw innerHTML', async () => {
    const payload = '<img src=x onerror=alert(1)>'
    const ast = makeAst([makeScene('s1', [makeDialogue('A', payload)])])
    const ctx = makeCtx([{ file: 'a.gal', ast }])
    const composer = new WebComposer()
    const target = await composer.transform(ctx)
    expect(target.html).not.toContain(`"<img`)
    expect(target.html).toContain('\\u003cimg')
    // stage.innerHTML = '' (清空) 是安全的;危险的是拼接用户文本
    expect(target.html).not.toContain("innerHTML = '<div")
    expect(target.html).toContain('textContent')
  })

  it('emit returns single index.html file', async () => {
    const ast = makeAst([makeScene('s1', [makeDialogue('A', 'hi')])])
    const ctx = makeCtx([{ file: 'a.gal', ast }])
    const composer = new WebComposer()
    const target = await composer.transform(ctx)
    const out = composer.emit(target, ctx)
    expect(out.kind).toBe('multi')
    if (out.kind === 'multi') {
      expect(out.files.length).toBe(1)
      expect(out.files[0]?.path).toBe('index.html')
    }
  })

  it('sprite/position carried into VM graph JSON', async () => {
    const ast = makeAst([makeScene('s1', [makeDialogue('小雪', '你好', 'a.png', 'left')])])
    const ctx = makeCtx([{ file: 'a.gal', ast }])
    const composer = new WebComposer()
    const target = await composer.transform(ctx)
    expect(target.html).toContain('"sprite":"a.png"')
    expect(target.html).toContain('"position":"left"')
  })

  it('embeds shared runtime-vm player (goto/marker parity)', async () => {
    const ast = makeAst([
      makeScene('s1', [
        makeDialogue('A', 'hi'),
        makeMarker('cp'),
        makeGoto('s2')
      ]),
      makeScene('s2', [makeDialogue('B', 'dest')])
    ])
    const ctx = makeCtx([{ file: 'a.gal', ast }])
    const composer = new WebComposer()
    const target = await composer.transform(ctx)
    expect(target.html).toContain('VM_GRAPH')
    expect(target.html).toContain('jumpToTarget')
    expect(target.html).toContain('executeGotoStep')
    expect(target.html).toContain('getCurrentStep')
    expect(target.html).not.toContain('parseScript')
  })

  it('VM graph matches inline player jump semantics', () => {
    const ast = makeAst([
      makeScene('s1', [makeChoice('go', 's2')]),
      makeScene('s2', [makeDialogue('A', 'dest')])
    ])
    const graph = buildVmGraph(ast)
    const state = createVmState(graph, 's1')
    const tsJump = jumpToTarget(graph, state, 's2')
    expect(tsJump.ok).toBe(true)

    const fnBlock = buildPlayerRuntimeFunctions()
    const browserJump = new Function(
      'graph',
      'state',
      `${fnBlock}; return jumpToTarget(graph, state, 's2');`
    ) as (
      graph: ReturnType<typeof buildVmGraph>,
      state: ReturnType<typeof createVmState>
    ) => ReturnType<typeof jumpToTarget>
    const browserResult = browserJump(graph, state)
    expect(browserResult).toEqual(tsJump)
  })
})
