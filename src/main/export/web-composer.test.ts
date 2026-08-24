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
import {buildVmGraph,
  createVmState,
  jumpToTarget,
  getCurrentStep,
  advanceVm,
  buildPlayerRuntimeFunctions
,
  buildBacklog,
  dialogueLineId,
  markRead,
  computeStageState } from '../../shared/preview/runtime-vm.js'
import { buildWebSaveKey } from '../../shared/preview/vm-save.js'

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

  it('VM graph matches inline player variable/if semantics', () => {
    const ast = makeAst([
      makeScene('s1', [
        {
          ...base(1),
          type: 'set',
          name: 'affinity',
          op: 'set',
          value: { kind: 'literal', value: 15 }
        },
        {
          ...base(1),
          type: 'if',
          branches: [
            {
              kind: 'if',
              condition: {
                kind: 'binary',
                op: 'ge',
                left: { kind: 'var', name: 'affinity' },
                right: { kind: 'literal', value: 10 }
              },
              children: [makeDialogue('A', 'high')]
            },
            { kind: 'else', children: [makeDialogue('A', 'low')] }
          ]
        }
      ])
    ])
    const graph = buildVmGraph(ast)
    let state = createVmState(graph, 's1')
    const adv = advanceVm(graph, state)
    expect(adv.ok).toBe(true)
    if (!adv.ok) return
    state = adv.state
    const tsStep = getCurrentStep(graph, state)
    expect(tsStep).toMatchObject({ text: 'high' })

    const fnBlock = buildPlayerRuntimeFunctions()
    const browserGet = new Function(
      'graph',
      'state',
      `${fnBlock}; return getCurrentStep(graph, state);`
    ) as (
      graph: ReturnType<typeof buildVmGraph>,
      state: ReturnType<typeof createVmState>
    ) => ReturnType<typeof getCurrentStep>
    expect(browserGet(graph, state)).toEqual(tsStep)
  })

  it('backlog/read-state functions match TS semantics (player parity)', () => {
    const ast = makeAst([
      makeScene('s1', [makeDialogue('A', '一'), makeDialogue('B', '二')]),
      makeScene('s2', [makeDialogue('A', '三')])
    ])
    const graph = buildVmGraph(ast)
    let state = createVmState(graph, 's1')
    const a1 = advanceVm(graph, state)
    if (!a1.ok) throw new Error('advance failed')
    state = a1.state
    const jmp = jumpToTarget(graph, state, 's2')
    if (!jmp.ok) throw new Error('jump failed')
    state = jmp.state
    const a2 = advanceVm(graph, state)
    if (!a2.ok) throw new Error('advance failed')
    state = a2.state

    const tsBacklog = buildBacklog(graph, state)
    const fnBlock = buildPlayerRuntimeFunctions()
    const browserBacklog = new Function(
      'graph',
      'state',
      `${fnBlock}; return buildBacklog(graph, state);`
    ) as (g: typeof graph, s: typeof state) => ReturnType<typeof buildBacklog>
    expect(browserBacklog(graph, state)).toEqual(tsBacklog)
    expect(tsBacklog.map((b) => b.text)).toEqual(['一', '二', '三'])

    const id = dialogueLineId('s1', 'A', '一')
    const read = markRead({ readLineIds: [] }, id)
    const browserRead = new Function(
      'read',
      'id',
      `${fnBlock}; return { marked: markRead(read, id), hit: isRead(read, id) };`
    ) as (r: { readLineIds: string[] }, i: string) => { marked: ReturnType<typeof markRead>; hit: boolean }
    const out = browserRead({ readLineIds: [] }, id)
    expect(out).toEqual({ marked: read, hit: false })
  })

  it('web player embeds trio controls and set auto-advance fix', async () => {
    const ast = makeAst([makeScene('s1', [makeDialogue('A', 'hi')])])
    const ctx = makeCtx([{ file: 'a.gal', ast }])
    const composer = new WebComposer()
    const target = await composer.transform(ctx)
    expect(target.html).toContain("'web-auto'")
    expect(target.html).toContain("'web-skip-read'")
    expect(target.html).toContain("'web-backlog'")
    expect(target.html).toContain("galide-read-' + PROJECT_ID")
    // set 步自动推进(修复卡死)
    expect(target.html).toContain("step.type === 'set'")
    expect(target.html).toContain('markCurrentRead(step)')
  })

  it('computeStageState parity between TS and inline player functions', () => {
    const ast = makeAst([
      makeScene('s1', [
        {
          ...base(1),
          type: 'stageEntry',
          character: '小雪',
          sprite: 'a.png',
          position: 'left' as const
        },
        {
          ...base(2),
          type: 'stageEntry',
          character: '阳',
          sprite: 'b.png',
          position: 'right' as const
        },
        makeDialogue('小雪', 'hi'),
        { ...base(4), type: 'stageExit', character: '阳' }
      ])
    ])
    const graph = buildVmGraph(ast)
    let state = createVmState(graph, 's1')
    const a1 = advanceVm(graph, state)
    if (a1.ok) state = a1.state
    const tsStage = computeStageState(graph, state)
    const fnBlock = buildPlayerRuntimeFunctions()
    const browserStage = new Function(
      'graph',
      'state',
      `${fnBlock}; return computeStageState(graph, state);`
    ) as (g: typeof graph, s: typeof state) => ReturnType<typeof computeStageState>
    expect(browserStage(graph, state)).toEqual(tsStage)
    expect(Object.keys(tsStage).sort()).toEqual(['小雪', '阳'])
  })

  it('embeds localStorage save key format (web player parity)', async () => {
    const ast = makeAst([makeScene('s1', [makeDialogue('A', 'hi')])])
    const ctx = makeCtx([{ file: 'a.gal', ast }])
    const composer = new WebComposer()
    const target = await composer.transform(ctx)
    expect(target.html).toContain('buildWebSaveKey')
    expect(target.html).toContain('serializeVmSave')
    expect(target.html).toContain('localStorage.setItem')
    expect(buildWebSaveKey('my-game', 1)).toBe('galide-save-my-game-slot-1')
  })
})
