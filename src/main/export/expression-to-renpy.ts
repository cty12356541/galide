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
  ge: '>='
}

/** 将 gal Expression 发射为 Ren'Py 可用的 Python 表达式字符串 */
export const emitRenpyExpression = (expr: Expression): string => {
  switch (expr.kind) {
    case 'literal':
      if (typeof expr.value === 'string') return JSON.stringify(expr.value)
      if (typeof expr.value === 'boolean') return expr.value ? 'True' : 'False'
      return String(expr.value)
    case 'var':
      return expr.name
    case 'unary':
      return `not ${emitRenpyExpression(expr.arg)}`
    case 'binary': {
      const op = BINARY_OP[expr.op]
      const left = emitRenpyExpression(expr.left)
      const right = emitRenpyExpression(expr.right)
      const needsParen =
        (expr.op === 'and' || expr.op === 'or') &&
        expr.left.kind === 'binary' &&
        (expr.left.op === 'or' || expr.left.op === 'and')
      const l = needsParen ? `(${left})` : left
      return `${l} ${op} ${right}`
    }
    default:
      return ''
  }
}
