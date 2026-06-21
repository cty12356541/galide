/**
 * gal 表达式 AST → Ren'Py Python 表达式 — 独立单元测试
 */
import { describe, expect, it } from 'vitest'
import { parseExpression } from '../../shared/dsl/expression.js'
import { emitRenpyExpression } from './expression-to-renpy.js'

describe('emitRenpyExpression', () => {
  it('maps numeric literal', () => {
    const r = parseExpression('42')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(emitRenpyExpression(r.expr)).toBe('42')
  })

  it('maps boolean literals to Python True/False', () => {
    const t = parseExpression('true')
    const f = parseExpression('false')
    expect(t.ok && f.ok).toBe(true)
    if (!t.ok || !f.ok) return
    expect(emitRenpyExpression(t.expr)).toBe('True')
    expect(emitRenpyExpression(f.expr)).toBe('False')
  })

  it('maps string literal with Python quoting', () => {
    const r = parseExpression('"hello"')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(emitRenpyExpression(r.expr)).toBe('"hello"')
  })

  it('escapes string special characters', () => {
    const r = parseExpression('"say \\"hi\\""')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(emitRenpyExpression(r.expr)).toBe('"say \\"hi\\""')
  })

  it('maps variable reference', () => {
    const r = parseExpression('affinity')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(emitRenpyExpression(r.expr)).toBe('affinity')
  })

  it('maps comparison operators', () => {
    const r = parseExpression('affinity >= 10')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(emitRenpyExpression(r.expr)).toBe('affinity >= 10')
  })

  it('maps and/or/not', () => {
    const r = parseExpression('not flag and affinity >= 10 or met')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(emitRenpyExpression(r.expr)).toBe('(not flag and affinity >= 10) or met')
  })

  it('parenthesizes nested and/or for precedence safety', () => {
    const r = parseExpression('(a == 1 or b == 2) and c')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(emitRenpyExpression(r.expr)).toBe('(a == 1 or b == 2) and c')
  })
})
