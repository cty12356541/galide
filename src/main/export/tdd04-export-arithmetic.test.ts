import { describe, expect, it } from 'vitest'
import { parseExpression, evaluateValue, serializeExpression } from '../../shared/dsl/expression'
import { emitInkExpression } from './expression-to-ink'
import { emitRenpyExpression } from './expression-to-renpy'

describe('tdd-04-export-arithmetic', () => {
  // ── parse ──
  it('parses addition', () => {
    const r = parseExpression('a + b')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.expr).toEqual({ kind: 'binary', op: 'add', left: { kind: 'var', name: 'a' }, right: { kind: 'var', name: 'b' } })
  })

  it('parses subtraction', () => {
    const r = parseExpression('a - b')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.expr).toEqual({ kind: 'binary', op: 'sub', left: { kind: 'var', name: 'a' }, right: { kind: 'var', name: 'b' } })
  })

  it('parses multiplication', () => {
    const r = parseExpression('a * b')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.expr).toEqual({ kind: 'binary', op: 'mul', left: { kind: 'var', name: 'a' }, right: { kind: 'var', name: 'b' } })
  })

  it('parses division', () => {
    const r = parseExpression('a / b')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.expr).toEqual({ kind: 'binary', op: 'div', left: { kind: 'var', name: 'a' }, right: { kind: 'var', name: 'b' } })
  })

  it('parses modulo', () => {
    const r = parseExpression('a % b')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.expr).toEqual({ kind: 'binary', op: 'mod', left: { kind: 'var', name: 'a' }, right: { kind: 'var', name: 'b' } })
  })

  it('parses arithmetic with precedence', () => {
    const r = parseExpression('a + b * 2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // * 高于 +，所以 b * 2 应在右侧
    expect(r.expr).toEqual({
      kind: 'binary',
      op: 'add',
      left: { kind: 'var', name: 'a' },
      right: { kind: 'binary', op: 'mul', left: { kind: 'var', name: 'b' }, right: { kind: 'literal', value: 2 } }
    })
  })

  it('parses parenthesized arithmetic', () => {
    const r = parseExpression('(a + b) * 2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.expr).toEqual({
      kind: 'binary',
      op: 'mul',
      left: { kind: 'binary', op: 'add', left: { kind: 'var', name: 'a' }, right: { kind: 'var', name: 'b' } },
      right: { kind: 'literal', value: 2 }
    })
  })

  // ── evaluate ──
  it('evaluates arithmetic expressions', () => {
    const r = parseExpression('10 + 5 * 2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(evaluateValue(r.expr, {})).toBe(20)
  })

  it('evaluates subtraction and division', () => {
    const r = parseExpression('20 - 4 / 2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(evaluateValue(r.expr, {})).toBe(18)
  })

  it('evaluates modulo', () => {
    const r = parseExpression('10 % 3')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(evaluateValue(r.expr, {})).toBe(1)
  })

  it('evaluates arithmetic with variables', () => {
    const r = parseExpression('score + bonus * 2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(evaluateValue(r.expr, { score: 5, bonus: 3 })).toBe(11)
  })

  // ── serialize round-trip ──
  it('round-trips arithmetic expression', () => {
    const r = parseExpression('a + b * 2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const out = serializeExpression(r.expr)
    const r2 = parseExpression(out)
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    expect(r2.expr).toEqual(r.expr)
  })

  // ── export emitters ──
  it('emits arithmetic to Ink', () => {
    const r = parseExpression('a + b * 2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(emitInkExpression(r.expr)).toBe('a + b * 2')
  })

  it('emits parenthesized arithmetic to Ink', () => {
    const r = parseExpression('(a + b) * 2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(emitInkExpression(r.expr)).toBe('(a + b) * 2')
  })

  it('emits arithmetic to RenPy', () => {
    const r = parseExpression('a + b * 2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(emitRenpyExpression(r.expr)).toBe('a + b * 2')
  })

  it('emits complex mixed expression to RenPy', () => {
    const r = parseExpression('health > 0 and (a + b) * 2 >= 10')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(emitRenpyExpression(r.expr)).toBe('health > 0 and (a + b) * 2 >= 10')
  })
})
