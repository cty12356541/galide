/**
 * gal DSL 表达式解析与求值 — 硬测覆盖
 */
import { describe, expect, it } from 'vitest'
import {
  evaluateCondition,
  evaluateValue,
  parseExpression,
  serializeExpression
} from './expression'

describe('expression parser', () => {
  it('parses numeric literal', () => {
    const r = parseExpression('42')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.expr).toEqual({ kind: 'literal', value: 42 })
  })

  it('parses boolean literals', () => {
    expect(parseExpression('true').ok).toBe(true)
    expect(parseExpression('false').ok).toBe(true)
  })

  it('parses string literal', () => {
    const r = parseExpression('"hello"')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.expr).toEqual({ kind: 'literal', value: 'hello' })
  })

  it('parses variable reference', () => {
    const r = parseExpression('affinity')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.expr).toEqual({ kind: 'var', name: 'affinity' })
  })

  it('parses comparison', () => {
    const r = parseExpression('affinity >= 10')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.expr.kind).toBe('binary')
  })

  it('parses and/or with precedence', () => {
    const r = parseExpression('a >= 1 and b == true or c')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.expr.kind).toBe('binary')
  })

  it('parses not unary', () => {
    const r = parseExpression('not flag')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.expr).toEqual({ kind: 'unary', op: 'not', arg: { kind: 'var', name: 'flag' } })
  })

  it('parses parenthesized subexpression', () => {
    const r = parseExpression('(a == 1 or b == 2) and c')
    expect(r.ok).toBe(true)
  })

  it('rejects empty input', () => {
    expect(parseExpression('').ok).toBe(false)
  })
})

describe('expression evaluator', () => {
  const vars = { affinity: 15, met: true, name: 'test', zero: 0 }

  it('evaluates numeric comparisons', () => {
    const e = parseExpression('affinity >= 10')
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(evaluateCondition(e.expr, vars)).toBe(true)
  })

  it('evaluates boolean and/or', () => {
    const e = parseExpression('affinity >= 10 and met == true')
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(evaluateCondition(e.expr, vars)).toBe(true)
  })

  it('evaluates not', () => {
    const e = parseExpression('not met')
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(evaluateCondition(e.expr, vars)).toBe(false)
  })

  it('evaluates value for set operations', () => {
    const e = parseExpression('10')
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(evaluateValue(e.expr, vars)).toBe(10)
  })

  it('evaluates variable as value', () => {
    const e = parseExpression('affinity')
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(evaluateValue(e.expr, vars)).toBe(15)
  })

  it('returns false for undefined variable in condition', () => {
    const e = parseExpression('missing >= 1')
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(evaluateCondition(e.expr, vars)).toBe(false)
  })

  it('string equality works', () => {
    const e = parseExpression('name == "test"')
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(evaluateCondition(e.expr, vars)).toBe(true)
  })
})

describe('expression serializer round-trip', () => {
  const samples = [
    '42',
    'true',
    '"hello"',
    'affinity >= 10',
    'affinity >= 10 and met == true',
    'not flag',
    '(a == 1 or b == 2) and c'
  ]

  for (const src of samples) {
    it(`round-trips "${src}"`, () => {
      const r = parseExpression(src)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      const out = serializeExpression(r.expr)
      const r2 = parseExpression(out)
      expect(r2.ok).toBe(true)
      if (!r2.ok) return
      expect(r2.expr).toEqual(r.expr)
    })
  }
})
