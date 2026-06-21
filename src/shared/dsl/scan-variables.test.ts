/**
 * scan-variables — 扫描 AST 中的变量赋值与门控条件(TDD)
 */
import { describe, expect, it } from 'vitest'
import { parse } from './parser'
import { scanScriptVariables } from './scan-variables'
import type { ScriptNode } from './types'

const parseOk = (src: string): ScriptNode => {
  const r = parse(src)
  if (!r.ok) throw new Error('parse failed')
  return r.value
}

describe('scanScriptVariables', () => {
  it('collects SetNode variable names', () => {
    const ast = parseOk(`## s1
设: affinity = 10
设: flag = true
设: score += 5
`)
    const result = scanScriptVariables(ast)
    expect(result.setVariables).toEqual(expect.arrayContaining(['affinity', 'flag', 'score']))
    expect(result.setVariables.filter((v) => v === 'affinity')).toHaveLength(1)
  })

  it('collects gated choice conditions as serialized expressions', () => {
    const ast = parseOk(`## s1
* "秘密" -> 结局A [当: affinity >= 10]
* "普通" -> 结局B
`)
    const result = scanScriptVariables(ast)
    expect(result.gatedChoices).toHaveLength(1)
    expect(result.gatedChoices[0]?.text).toBe('秘密')
    expect(result.gatedChoices[0]?.condition).toContain('affinity')
  })

  it('collects if-branch conditions', () => {
    const ast = parseOk(`## s1
[若: affinity >= 10]
小雪: "高"
[否则若: affinity >= 5]
小雪: "中"
[否则]
小雪: "低"
[若终]
`)
    const result = scanScriptVariables(ast)
    expect(result.conditionalBranches.length).toBeGreaterThanOrEqual(2)
    expect(result.conditionalBranches.some((b) => b.condition.includes('affinity'))).toBe(true)
  })

  it('deduplicates set variable names', () => {
    const ast = parseOk(`## s1
设: affinity = 0
设: affinity += 1
`)
    const result = scanScriptVariables(ast)
    expect(result.setVariables.filter((v) => v === 'affinity')).toHaveLength(1)
  })
})
