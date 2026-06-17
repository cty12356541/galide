/**
 * JSON Composer 单测(适配新版真实现)
 * 覆盖: emit 返 string,内容含 project + scripts 完整结构
 */
import { describe, it, expect } from 'vitest'
import { JsonComposer } from './json-composer.js'
import type { ScriptNode, SceneNode, DialogueNode, BaseNode } from '../../shared/dsl/types.js'
import type { ExportContext, AstEntry } from './composer.js'

const base = (line: number): BaseNode => ({ line, column: 1 })

const makeDialogue = (text: string): DialogueNode => ({
  ...base(1),
  type: 'dialogue',
  character: '测试',
  lines: [text]
})

const makeScene = (id: string, dialogues: readonly DialogueNode[]): SceneNode => ({
  ...base(1),
  type: 'scene',
  id,
  children: [...dialogues]
})

const makeAst = (): ScriptNode => ({
  ...base(1),
  type: 'script',
  children: [makeScene('ch1', [makeDialogue('你好'), makeDialogue('世界')])],
  errors: []
})

const makeContext = (asts: readonly AstEntry[]): ExportContext => ({
  request: {
    projectPath: '/tmp/proj',
    target: 'json',
    outputPath: '/tmp/out'
  },
  asts,
  outputDir: '/tmp/out',
  progress: () => {}
})

describe('JsonComposer (真实现)', () => {
  it('name === "json"', () => {
    const c = new JsonComposer()
    expect(c.name).toBe('json')
    expect(c.defaultFilename).toBe('script.json')
  })

  it('transform 把 asts 装进 JsonAst', () => {
    const c = new JsonComposer()
    const ctx = makeContext([{ file: 'ch1.gal', ast: makeAst() }])
    const jsonAst = c.transform(ctx)
    expect(jsonAst.project.projectPath).toBe('/tmp/proj')
    expect(Number.isNaN(Date.parse(jsonAst.project.exportedAt))).toBe(false)
    expect(jsonAst.scripts).toHaveLength(1)
    expect(jsonAst.scripts[0]?.file).toBe('ch1.gal')
    expect(jsonAst.scripts[0]?.ast.children[0]?.type).toBe('scene')
  })

  it('emit 返 string 且 JSON.parse 后结构一致', () => {
    const c = new JsonComposer()
    const ctx = makeContext([{ file: 'ch1.gal', ast: makeAst() }])
    const out = c.emit(c.transform(ctx), ctx)
    expect(typeof out).toBe('string')
    const parsed = JSON.parse(out) as { project: { projectPath: string }; scripts: unknown[] }
    expect(parsed.project.projectPath).toBe('/tmp/proj')
    expect(parsed.scripts).toHaveLength(1)
  })

  it('空 asts 也返有效 JSON', () => {
    const c = new JsonComposer()
    const ctx = makeContext([])
    const out = c.emit(c.transform(ctx), ctx)
    const parsed = JSON.parse(out) as { scripts: unknown[] }
    expect(parsed.scripts).toEqual([])
  })
})
