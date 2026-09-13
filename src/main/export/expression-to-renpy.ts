/**
 * gal 表达式 AST → Ren'Py Python 表达式
 *
 * gal 与 Python 子集对齐: and/or/not、比较、字面量、变量引用。
 * 布尔字面量映射为 Python True/False。
 */

import type { BinaryOp, Expression } from '../../shared/dsl/expression.js'

const BINARY_OP: Record<BinaryOp, string> = {
  and: 'and',
  or: 'or',
  eq: '==',
  ne: '!=',
  lt: '<',
  le: '<=',
  gt: '>',
  ge: '>=',
  add: '+',
  sub: '-',
  mul: '*',
  div: '/',
  mod: '%'
}

/** 将 gal Expression 发射为 Ren'Py 可用的 Python 表达式字符串 */
export const emitRenpyExpression = (expr: Expression): string => {
  const opPrec = (op: BinaryOp): number => {
    switch (op) {
      case 'or': return 1
      case 'and': return 2
      case 'eq':
      case 'ne':
      case 'lt':
      case 'le':
      case 'gt':
      case 'ge': return 3
      case 'add':
      case 'sub': return 4
      case 'mul':
      case 'div':
      case 'mod': return 5
    }
  }
  switch (expr.kind) {
    case 'literal':
      if (typeof expr.value === 'string') return JSON.stringify(expr.value)
      if (typeof expr.value === 'boolean') return expr.value ? 'True' : 'False'
      return String(expr.value)
    case 'var':
      return expr.name
    case 'unary': {
      const arg = emitRenpyExpression(expr.arg)
      const needsParen = expr.arg.kind === 'binary'
      return `not ${needsParen ? `(${arg})` : arg}`
    }
    case 'binary': {
      const op = BINARY_OP[expr.op]
      const left = emitRenpyExpression(expr.left)
      const right = emitRenpyExpression(expr.right)
      let l = left
      let r = right
      if (expr.op === 'and' || expr.op === 'or') {
        if (expr.left.kind === 'binary' && (expr.left.op === 'or' || expr.left.op === 'and')) {
          l = `(${left})`
        }
      } else {
        const lp = opPrec(expr.op)
        if (expr.left.kind === 'binary' && opPrec(expr.left.op) < lp) l = `(${left})`
        if (expr.right.kind === 'binary' && opPrec(expr.right.op) <= lp) r = `(${right})`
      }
      return `${l} ${op} ${r}`
    }
    default:
      throw new Error('Unsupported expression: ' + (expr as { kind: string }).kind)
  }
}
