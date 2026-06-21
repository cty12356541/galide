/**
 * group-beats + branch mapping — 纯函数单测(TDD)
 */
import { describe, expect, it } from 'vitest'
import type { IfNode, SceneNode } from '../../../../shared/dsl/types'
import { groupBeats, mapIfBranchesToEditableGroups } from './group-beats'

const makeIfNode = (branches: IfNode['branches']): IfNode => ({
  type: 'if',
  line: 1,
  column: 1,
  branches
})

describe('groupBeats', () => {
  it('groups consecutive choice nodes into a decision beat', () => {
    const children: SceneNode['children'] = [
      { type: 'dialogue', character: 'A', lines: ['hi'], line: 1, column: 1 },
      { type: 'choice', line: 2, column: 1, options: [{ text: 'a', target: 's2' }] },
      { type: 'choice', line: 3, column: 1, options: [{ text: 'b', target: 's3' }] },
      { type: 'goto', target: 'end', line: 4, column: 1 }
    ]
    const beats = groupBeats(children)
    expect(beats).toHaveLength(3)
    expect(beats[0]?.kind).toBe('dialogue')
    expect(beats[1]?.kind).toBe('decision')
    if (beats[1]?.kind === 'decision') {
      expect(beats[1].nodes).toHaveLength(2)
      expect(beats[1].startIndex).toBe(1)
    }
    expect(beats[2]?.kind).toBe('goto')
  })

  it('maps set, conditional, marker node kinds', () => {
    const children: SceneNode['children'] = [
      { type: 'set', name: 'x', op: 'set', value: { kind: 'literal', value: 1 }, line: 1, column: 1 },
      makeIfNode([
        { kind: 'if', condition: { kind: 'literal', value: true }, children: [] },
        { kind: 'else', children: [] }
      ]),
      { type: 'marker', id: 'm1', line: 3, column: 1 }
    ]
    const beats = groupBeats(children)
    expect(beats.map((b) => b.kind)).toEqual(['set', 'conditional', 'marker'])
  })
})

describe('mapIfBranchesToEditableGroups', () => {
  it('maps each branch children through groupBeats', () => {
    const ifNode = makeIfNode([
      {
        kind: 'if',
        condition: { kind: 'binary', op: 'ge', left: { kind: 'var', name: 'affinity' }, right: { kind: 'literal', value: 10 } },
        children: [
          { type: 'dialogue', character: '小雪', lines: ['高好感'], line: 2, column: 1 },
          { type: 'choice', line: 3, column: 1, options: [{ text: 'ok', target: 's2' }] }
        ]
      },
      {
        kind: 'else',
        children: [{ type: 'dialogue', character: '小雪', lines: ['低好感'], line: 5, column: 1 }]
      }
    ])
    const groups = mapIfBranchesToEditableGroups(ifNode)
    expect(groups).toHaveLength(2)
    expect(groups[0]?.kind).toBe('if')
    expect(groups[0]?.branchIndex).toBe(0)
    expect(groups[0]?.beats.map((b) => b.kind)).toEqual(['dialogue', 'decision'])
    expect(groups[1]?.kind).toBe('else')
    expect(groups[1]?.beats).toHaveLength(1)
    expect(groups[1]?.beats[0]?.kind).toBe('dialogue')
  })

  it('supports nested if inside branch children', () => {
    const nestedIf = makeIfNode([
      { kind: 'if', condition: { kind: 'literal', value: true }, children: [] },
      { kind: 'else', children: [] }
    ])
    const ifNode = makeIfNode([
      { kind: 'if', condition: { kind: 'literal', value: true }, children: [nestedIf] }
    ])
    const groups = mapIfBranchesToEditableGroups(ifNode)
    expect(groups[0]?.beats[0]?.kind).toBe('conditional')
  })
})
