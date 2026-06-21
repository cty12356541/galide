/**
 * beat-locator — 嵌套 if 分支 children 数组定位(TDD)
 */
import { describe, expect, it } from 'vitest'
import type { IfNode, SceneNode, ScriptNode } from '../../../../shared/dsl/types'
import { mutateBeatChildren, resolveBeatChildren } from './beat-locator'

const makeScene = (id: string, children: SceneNode['children']): SceneNode => ({
  type: 'scene',
  id,
  line: 1,
  column: 1,
  children
})

const makeAst = (scene: SceneNode): ScriptNode => ({
  type: 'script',
  line: 1,
  column: 1,
  children: [scene],
  errors: []
})

describe('beat-locator', () => {
  it('resolveBeatChildren with empty locator returns scene.children', () => {
    const scene = makeScene('s1', [
      { type: 'dialogue', character: 'A', lines: ['hi'], line: 1, column: 1 }
    ])
    const arr = resolveBeatChildren(scene, [])
    expect(arr).toBe(scene.children)
    expect(arr).toHaveLength(1)
  })

  it('resolves nested if-branch children via locator steps', () => {
    const innerIf: IfNode = {
      type: 'if',
      line: 3,
      column: 1,
      branches: [
        {
          kind: 'if',
          condition: { kind: 'literal', value: true },
          children: [{ type: 'dialogue', character: 'B', lines: ['nested'], line: 4, column: 1 }]
        }
      ]
    }
    const outerIf: IfNode = {
      type: 'if',
      line: 2,
      column: 1,
      branches: [{ kind: 'if', condition: { kind: 'literal', value: true }, children: [innerIf] }]
    }
    const scene = makeScene('s1', [outerIf])
    const locator = [
      { kind: 'into-child' as const, index: 0 },
      { kind: 'into-branch' as const, branchIndex: 0 },
      { kind: 'into-child' as const, index: 0 },
      { kind: 'into-branch' as const, branchIndex: 0 }
    ]
    const arr = resolveBeatChildren(scene, locator)
    expect(arr).toHaveLength(1)
    expect(arr?.[0]?.type).toBe('dialogue')
  })

  it('mutateBeatChildren edits nested branch in AST', () => {
    const outerIf: IfNode = {
      type: 'if',
      line: 1,
      column: 1,
      branches: [
        {
          kind: 'if',
          condition: { kind: 'literal', value: true },
          children: [{ type: 'dialogue', character: 'A', lines: ['old'], line: 2, column: 1 }]
        }
      ]
    }
    const ast = makeAst(makeScene('s1', [outerIf]))
    mutateBeatChildren(ast, 's1', [{ kind: 'into-child', index: 0 }, { kind: 'into-branch', branchIndex: 0 }], (children) => {
      const d = children[0]
      if (d?.type === 'dialogue') d.lines = ['new']
    })
    const branch = (ast.children[0] as SceneNode).children[0] as IfNode
    const dialogue = branch.branches[0]?.children[0]
    expect(dialogue?.type).toBe('dialogue')
    if (dialogue?.type === 'dialogue') {
      expect(dialogue.lines[0]).toBe('new')
    }
  })
})
