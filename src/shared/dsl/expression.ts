/**
 * gal DSL 安全表达式 — 解析、序列化、求值(无 eval)
 *
 * 支持: 数字/布尔/字符串字面量、变量引用、比较、and/or/not、括号。
 */

export interface ExprLiteral {
  kind: 'literal'
  value: number | boolean | string
}

export interface ExprVar {
  kind: 'var'
  name: string
}

export interface ExprUnary {
  kind: 'unary'
  op: 'not'
  arg: Expression
}

export type BinaryOp = 'and' | 'or' | 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge'

export interface ExprBinary {
  kind: 'binary'
  op: BinaryOp
  left: Expression
  right: Expression
}

export type Expression = ExprLiteral | ExprVar | ExprUnary | ExprBinary

export interface ExprParseError {
  message: string
  offset: number
}

export type ExprParseResult =
  | { ok: true; expr: Expression; rest: string }
  | { ok: false; error: ExprParseError }

const OP_WORDS: Record<string, BinaryOp> = {
  and: 'and',
  or: 'or',
  '==': 'eq',
  '!=': 'ne',
  '<': 'lt',
  '<=': 'le',
  '>': 'gt',
  '>=': 'ge'
}

const SERIALIZE_OP: Record<BinaryOp, string> = {
  and: 'and',
  or: 'or',
  eq: '==',
  ne: '!=',
  lt: '<',
  le: '<=',
  gt: '>',
  ge: '>='
}

const isIdentStart = (c: string): boolean => /[a-zA-Z_]/.test(c)
const isIdentChar = (c: string): boolean => /[a-zA-Z0-9_]/.test(c)

const skipWs = (s: string, i: number): number => {
  while (i < s.length && /\s/.test(s[i] ?? '')) i++
  return i
}

const parsePrimary = (s: string, i: number): ExprParseResult => {
  i = skipWs(s, i)
  if (i >= s.length) return { ok: false, error: { message: '期望表达式', offset: i } }

  const ch = s[i] ?? ''
  if (ch === '(') {
    const inner = parseOr(s, i + 1)
    if (!inner.ok) return inner
    const afterExpr = s.length - inner.rest.length
    const closeAt = skipWs(s, afterExpr)
    if (s[closeAt] !== ')') {
      return { ok: false, error: { message: '缺少 )', offset: closeAt } }
    }
    return { ok: true, expr: inner.expr, rest: s.slice(closeAt + 1) }
  }

  if (ch === '"') {
    let j = i + 1
    let value = ''
    while (j < s.length) {
      const c = s[j] ?? ''
      if (c === '"') {
        return { ok: true, expr: { kind: 'literal', value }, rest: s.slice(j + 1) }
      }
      if (c === '\\' && j + 1 < s.length) {
        value += s[j + 1] ?? ''
        j += 2
        continue
      }
      value += c
      j++
    }
    return { ok: false, error: { message: '未闭合字符串', offset: i } }
  }

  if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(s[i + 1] ?? ''))) {
    let j = i
    if (s[j] === '-') j++
    while (j < s.length && /[0-9.]/.test(s[j] ?? '')) j++
    const num = Number(s.slice(i, j))
    if (Number.isNaN(num)) return { ok: false, error: { message: '无效数字', offset: i } }
    return { ok: true, expr: { kind: 'literal', value: num }, rest: s.slice(j) }
  }

  if (isIdentStart(ch)) {
    let j = i + 1
    while (j < s.length && isIdentChar(s[j] ?? '')) j++
    const word = s.slice(i, j)
    if (word === 'true') return { ok: true, expr: { kind: 'literal', value: true }, rest: s.slice(j) }
    if (word === 'false') return { ok: true, expr: { kind: 'literal', value: false }, rest: s.slice(j) }
    return { ok: true, expr: { kind: 'var', name: word }, rest: s.slice(j) }
  }

  return { ok: false, error: { message: `无法解析: ${ch}`, offset: i } }
}

const parseUnary = (s: string, i: number): ExprParseResult => {
  i = skipWs(s, i)
  if (s.slice(i, i + 3) === 'not' && (i + 3 >= s.length || !isIdentChar(s[i + 3] ?? ''))) {
    const inner = parseUnary(s, i + 3)
    if (!inner.ok) return inner
    return { ok: true, expr: { kind: 'unary', op: 'not', arg: inner.expr }, rest: inner.rest }
  }
  return parsePrimary(s, i)
}

const tryParseBinOp = (s: string, i: number): { op: BinaryOp; len: number } | null => {
  i = skipWs(s, i)
  const slice = s.slice(i)
  const keys = ['>=', '<=', '==', '!=', '>', '<', 'and', 'or']
  for (const k of keys.sort((a, b) => b.length - a.length)) {
    if (slice.startsWith(k)) {
      const next = slice[k.length] ?? ''
      if (k === 'and' || k === 'or') {
        if (isIdentChar(next)) continue
      }
      const op = OP_WORDS[k]
      if (op) return { op, len: k.length }
    }
  }
  return null
}

const parseComparison = (s: string, i: number): ExprParseResult => {
  const left = parseUnary(s, i)
  if (!left.ok) return left
  let rest = left.rest
  let expr = left.expr
  for (;;) {
    const pos = s.length - rest.length
    const opStart = skipWs(s, pos)
    const opInfo = tryParseBinOp(s, pos)
    if (!opInfo || (opInfo.op !== 'eq' && opInfo.op !== 'ne' && opInfo.op !== 'lt' && opInfo.op !== 'le' && opInfo.op !== 'gt' && opInfo.op !== 'ge')) break
    const right = parseUnary(s, opStart + opInfo.len)
    if (!right.ok) return right
    expr = { kind: 'binary', op: opInfo.op, left: expr, right: right.expr }
    rest = right.rest
  }
  return { ok: true, expr, rest }
}

const parseAnd = (s: string, i: number): ExprParseResult => {
  const left = parseComparison(s, i)
  if (!left.ok) return left
  let rest = left.rest
  let expr = left.expr
  for (;;) {
    const pos = s.length - rest.length
    const opStart = skipWs(s, pos)
    const opInfo = tryParseBinOp(s, pos)
    if (!opInfo || opInfo.op !== 'and') break
    const right = parseComparison(s, opStart + opInfo.len)
    if (!right.ok) return right
    expr = { kind: 'binary', op: 'and', left: expr, right: right.expr }
    rest = right.rest
  }
  return { ok: true, expr, rest }
}

const parseOr = (s: string, i: number): ExprParseResult => {
  const left = parseAnd(s, i)
  if (!left.ok) return left
  let rest = left.rest
  let expr = left.expr
  for (;;) {
    const pos = s.length - rest.length
    const opStart = skipWs(s, pos)
    const opInfo = tryParseBinOp(s, pos)
    if (!opInfo || opInfo.op !== 'or') break
    const right = parseAnd(s, opStart + opInfo.len)
    if (!right.ok) return right
    expr = { kind: 'binary', op: 'or', left: expr, right: right.expr }
    rest = right.rest
  }
  return { ok: true, expr, rest }
}

/** 解析完整表达式(允许尾部空白) */
export const parseExpression = (source: string): ExprParseResult => {
  const trimmed = source.trim()
  if (!trimmed) return { ok: false, error: { message: '空表达式', offset: 0 } }
  const r = parseOr(trimmed, 0)
  if (!r.ok) return r
  const rest = r.rest.trim()
  if (rest.length > 0) {
    return { ok: false, error: { message: `多余内容: ${rest}`, offset: trimmed.length - rest.length } }
  }
  return { ok: true, expr: r.expr, rest: '' }
}

const toNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isNaN(n) ? null : n
  }
  return null
}

const compare = (op: BinaryOp, left: unknown, right: unknown): boolean => {
  if (op === 'eq') return left === right
  if (op === 'ne') return left !== right
  const ln = toNumber(left)
  const rn = toNumber(right)
  if (ln === null || rn === null) return false
  if (op === 'lt') return ln < rn
  if (op === 'le') return ln <= rn
  if (op === 'gt') return ln > rn
  if (op === 'ge') return ln >= rn
  return false
}

/** 求值为原始值(用于设:赋值) */
export const evaluateValue = (
  expr: Expression,
  vars: Record<string, unknown>
): number | boolean | string | null => {
  switch (expr.kind) {
    case 'literal':
      return expr.value
    case 'var':
      return vars[expr.name] !== undefined ? (vars[expr.name] as number | boolean | string) : null
    case 'unary':
      if (expr.op === 'not') return !evaluateCondition(expr.arg, vars)
      return null
    case 'binary': {
      if (expr.op === 'and') return evaluateCondition(expr.left, vars) && evaluateCondition(expr.right, vars)
      if (expr.op === 'or') return evaluateCondition(expr.left, vars) || evaluateCondition(expr.right, vars)
      const l = evaluateValue(expr.left, vars)
      const r = evaluateValue(expr.right, vars)
      return compare(expr.op, l, r)
    }
    default:
      return null
  }
}

/** 求值为布尔(用于条件分支/选项门控) */
export const evaluateCondition = (expr: Expression, vars: Record<string, unknown>): boolean => {
  const v = evaluateValue(expr, vars)
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') return v.length > 0
  return false
}

export const serializeExpression = (expr: Expression): string => {
  switch (expr.kind) {
    case 'literal':
      if (typeof expr.value === 'string') return `"${expr.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
      return String(expr.value)
    case 'var':
      return expr.name
    case 'unary':
      return `not ${serializeExpression(expr.arg)}`
    case 'binary': {
      const op = SERIALIZE_OP[expr.op]
      const needsParen =
        expr.op === 'and' || expr.op === 'or'
          ? expr.left.kind === 'binary' && (expr.left.op === 'or' || expr.left.op === 'and')
          : false
      const l = needsParen ? `(${serializeExpression(expr.left)})` : serializeExpression(expr.left)
      return `${l} ${op} ${serializeExpression(expr.right)}`
    }
    default:
      return ''
  }
}
