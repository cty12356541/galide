/**
 * gal 表达式 AST → Ink 内联表达式
 *
 * Ink 逻辑子集: ==, !=, <, >, <=, >=, &&, ||, not, true/false 字面量。
 */

import type { BinaryOp, Expression } from '../../shared/dsl/expression.js'

const BINARY_OP: Record<BinaryOp, string> = {
  and: '&&',
  or: '||',
  eq: '==',
  ne: '!=',
  lt: '<',
  le: '<=',
  gt: '>',
  ge: '>='
}

/** 将 gal Expression 发射为 Ink 条件/赋值可用的表达式字符串 */
export const emitInkExpression = (expr: Expression): string => {
  switch (expr.kind) {
    case 'literal':
      if (typeof expr.value === 'string') return JSON.stringify(expr.value)
      if (typeof expr.value === 'boolean') return expr.value ? 'true' : 'false'
      return String(expr.value)
    case 'var':
      return expr.name
    case 'unary':
      return `not ${emitInkExpression(expr.arg)}`
    case 'binary': {
      const op = BINARY_OP[expr.op]
      const left = emitInkExpression(expr.left)
      const right = emitInkExpression(expr.right)
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
