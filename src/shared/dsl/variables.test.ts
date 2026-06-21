/**
 * gal DSL 变量/条件语法测试 — TDD 契约层
 */
import { describe, expect, it } from 'vitest'
import { parse } from './parser'
import { serialize } from './serializer'
import type { IfNode, SceneNode, ScriptNode, SetNode } from './types'

const parseOk = (src: string): ScriptNode => {
  const r = parse(src)
  if (!r.ok) throw new Error('parse failed')
  return r.value
}

describe('gal variable + conditional DSL', () => {
  it('parses set variable lines (=, +=, -=)', () => {
    const src = `## s1
设: affinity = 10
设: affinity += 5
设: flag = true
设: name = "hero"
`
    const ast = parseOk(src)
    const scene = ast.children[0] as SceneNode
    const sets = scene.children.filter((c): c is SetNode => c.type === 'set')
    expect(sets.length).toBe(4)
    expect(sets[0]).toMatchObject({ name: 'affinity', op: 'set' })
    expect(sets[1]).toMatchObject({ name: 'affinity', op: 'add' })
    expect(sets[2]).toMatchObject({ name: 'flag', op: 'set' })
    expect(sets[3]).toMatchObject({ name: 'name', op: 'set' })
  })

  it('parses if/elif/else/end blocks', () => {
    const src = `## s1
[若: affinity >= 10]
小雪: "高好感"
[否则若: affinity >= 5]
小雪: "中好感"
[否则]
小雪: "低好感"
[若终]
`
    const ast = parseOk(src)
    const scene = ast.children[0] as SceneNode
    const ifNode = scene.children.find((c): c is IfNode => c.type === 'if')
    expect(ifNode).toBeDefined()
    expect(ifNode?.branches.length).toBe(3)
    expect(ifNode?.branches[0]?.kind).toBe('if')
    expect(ifNode?.branches[1]?.kind).toBe('elif')
    expect(ifNode?.branches[2]?.kind).toBe('else')
    expect(ifNode?.branches[0]?.children.length).toBe(1)
    expect(ifNode?.branches[0]?.children[0]?.type).toBe('dialogue')
  })

  it('parses conditional choice with [当: expr]', () => {
    const src = `## s1
* "秘密路线" -> 结局A [当: affinity >= 10]
* "普通路线" -> 结局B
`
    const ast = parseOk(src)
    const scene = ast.children[0] as SceneNode
    const choices = scene.children.filter((c) => c.type === 'choice')
    expect(choices.length).toBe(2)
    const first = choices[0]
    if (first?.type === 'choice') {
      expect(first.options[0]?.condition).toBeDefined()
      expect(first.options[0]?.text).toBe('秘密路线')
    }
    const second = choices[1]
    if (second?.type === 'choice') {
      expect(second.options[0]?.condition).toBeUndefined()
    }
  })

  it('serialize→parse round-trips variable/conditional syntax', () => {
    const src = `## 教室
设: affinity = 0
[若: affinity >= 10]
小雪: "高"
[否则]
小雪: "低"
[若终]
* "加好感" -> 加好感 [当: affinity >= 5]
设: affinity += 10
`
    const text1 = serialize(parseOk(src))
    const text2 = serialize(parseOk(text1))
    expect(text2).toBe(text1)
  })
})
