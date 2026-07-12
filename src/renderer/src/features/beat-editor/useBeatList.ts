/**
 * useBeatList — beat list mutation helpers hook
 */
import { useCallback } from 'react'
import type { AstNode, DialogueNode, IfNode, SetNode } from '../../../../shared/dsl/types'
import { mutateBeatChildren, type BeatLocator } from './beat-locator'
import type { ScriptNode } from '../../../../shared/dsl/types'
import { parseExpression } from '../../../../shared/dsl/expression'
import type { Beat } from './group-beats'

export interface BeatListMutators {
  mutateChildren: (fn: (c: AstNode[]) => void) => void
  removeBeat: (start: number, count: number) => void
  moveBeat: (start: number, count: number, dir: -1 | 1) => void
  addBeat: (kind: Beat['kind']) => void
  updateDialogue: (idx: number, patch: Partial<DialogueNode>) => void
  updateOption: (
    groupStart: number,
    optionIdx: number,
    patch: Partial<{ text: string; target: string; conditionText: string }>
  ) => void
  addOption: (groupStart: number) => void
  removeOption: (groupStart: number, optionIdx: number) => void
  childLocator: (ifBeatIndex: number, branchIndex: number) => BeatLocator
}

export const useBeatList = (
  sceneId: string,
  locator: BeatLocator,
  commit: (mutator: (ast: ScriptNode) => void) => void
): BeatListMutators => {
  const mutateChildren = useCallback(
    (fn: (c: AstNode[]) => void): void => {
      commit((ast) => mutateBeatChildren(ast, sceneId, locator, fn))
    },
    [commit, sceneId, locator]
  )

  const removeBeat = useCallback(
    (start: number, count: number): void => {
      mutateChildren((c) => c.splice(start, count))
    },
    [mutateChildren]
  )

  const moveBeat = useCallback(
    (start: number, count: number, dir: -1 | 1): void => {
      mutateChildren((c) => {
        const target = dir === -1 ? start - 1 : start + count
        if (target < 0 || target >= c.length) return
        const moved = c.splice(start, count)
        c.splice(target, 0, ...moved)
      })
    },
    [mutateChildren]
  )

  const addBeat = useCallback(
    (kind: Beat['kind']): void => {
      mutateChildren((c) => {
        let node: AstNode
        if (kind === 'dialogue') {
          node = { type: 'dialogue', character: '角色', lines: [''], line: 0, column: 1 } as DialogueNode
        } else if (kind === 'decision') {
          node = { type: 'choice', line: 0, column: 1, options: [{ text: '新选项', target: '' }] }
        } else if (kind === 'set') {
          node = {
            type: 'set',
            name: 'affinity',
            op: 'set',
            value: { kind: 'literal', value: 0 },
            line: 0,
            column: 1
          } as SetNode
        } else if (kind === 'conditional') {
          node = {
            type: 'if',
            line: 0,
            column: 1,
            branches: [
              { kind: 'if', condition: { kind: 'literal', value: true }, children: [] },
              { kind: 'else', children: [] }
            ]
          } as IfNode
        } else if (kind === 'goto') {
          node = { type: 'goto', target: '', line: 0, column: 1 }
        } else {
          node = { type: 'marker', id: '新标记', line: 0, column: 1 }
        }
        c.push(node)
      })
    },
    [mutateChildren]
  )

  const updateDialogue = useCallback(
    (idx: number, patch: Partial<DialogueNode>): void => {
      mutateChildren((c) => {
        const n = c[idx]
        if (n?.type === 'dialogue') Object.assign(n, patch)
      })
    },
    [mutateChildren]
  )

  const updateOption = useCallback(
    (
      groupStart: number,
      optionIdx: number,
      patch: Partial<{ text: string; target: string; conditionText: string }>
    ): void => {
      mutateChildren((c) => {
        const n = c[groupStart + optionIdx]
        if (n?.type === 'choice' && n.options[0]) {
          const { conditionText, ...rest } = patch
          Object.assign(n.options[0], rest)
          if (conditionText !== undefined) {
            if (!conditionText.trim()) {
              delete n.options[0].condition
            } else {
              const parsed = parseExpression(conditionText)
              if (parsed.ok) n.options[0].condition = parsed.expr
            }
          }
        }
      })
    },
    [mutateChildren]
  )

  const addOption = useCallback(
    (groupStart: number): void => {
      mutateChildren((c) => {
        const node = { type: 'choice' as const, line: 0, column: 1, options: [{ text: '新选项', target: '' }] }
        let end = groupStart
        while (end < c.length && c[end]?.type === 'choice') end++
        c.splice(end, 0, node)
      })
    },
    [mutateChildren]
  )

  const removeOption = useCallback(
    (groupStart: number, optionIdx: number): void => {
      mutateChildren((c) => c.splice(groupStart + optionIdx, 1))
    },
    [mutateChildren]
  )

  const childLocator = useCallback(
    (ifBeatIndex: number, branchIndex: number): BeatLocator => [
      ...locator,
      { kind: 'into-child', index: ifBeatIndex },
      { kind: 'into-branch', branchIndex }
    ],
    [locator]
  )

  return {
    mutateChildren,
    removeBeat,
    moveBeat,
    addBeat,
    updateDialogue,
    updateOption,
    addOption,
    removeOption,
    childLocator
  }
}
