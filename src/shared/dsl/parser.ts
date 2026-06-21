/**
 * gal DSL 语法分析器
 * 输入: Token[]
 * 输出: ScriptAST + ParseError[]
 *
 * 解析失败不抛异常,返回结构化错误
 */

import { parseExpression } from './expression.js'
import type { Expression } from './expression.js'
import type {
  AstNode,
  ChoiceNode,
  DialogueNode,
  GotoNode,
  IfNode,
  MarkerNode,
  ParseError,
  Result,
  SceneNode,
  ScriptNode,
  SetNode,
  SetOp,
  Token
} from './types.js'
import { tokenize } from './lexer.js'

const collectLines = (tokens: Token[]): Token[][] => {
  const lines: Token[][] = [[]]
  for (const t of tokens) {
    if (t.type === 'newline') {
      if (lines[lines.length - 1]?.length) lines.push([])
      continue
    }
    lines[lines.length - 1]?.push(t)
  }
  return lines.filter((l) => l.length > 0)
}

type Pending = {
  currentScene: SceneNode | null
  currentDialogue: DialogueNode | null
  pendingSprite: string | undefined
  pendingPosition: 'left' | 'right' | 'center' | undefined
}

type IfFrame = {
  node: IfNode
  branchIndex: number
}

type ParseCtx = {
  pending: Pending
  errors: ParseError[]
  root: ScriptNode
  ifStack: IfFrame[]
}

const pushNode = (ctx: ParseCtx, node: AstNode): void => {
  const frame = ctx.ifStack[ctx.ifStack.length - 1]
  if (frame) {
    const branch = frame.node.branches[frame.branchIndex]
    branch?.children.push(node)
    return
  }
  if (ctx.pending.currentScene) {
    ctx.pending.currentScene.children.push(node)
  } else {
    ctx.root.children.push(node)
  }
}

const parseSetOp = (raw: string): SetOp => {
  if (raw === 'add') return 'add'
  if (raw === 'sub') return 'sub'
  return 'set'
}

const parseExprToken = (
  source: string,
  line: number,
  column: number,
  errors: ParseError[],
  label: string
): Expression | undefined => {
  const r = parseExpression(source)
  if (r.ok === false) {
    errors.push({
      message: `${label}表达式无效: ${r.error.message}`,
      line,
      column,
      severity: 'warning'
    })
    return undefined
  }
  return r.expr
}

const buildLineAst = (line: Token[], ctx: ParseCtx): void => {
  const { pending, errors } = ctx
  const first = line[0]
  if (!first) return

  switch (first.type) {
    case 'chapter': {
      pending.currentScene = null
      pending.currentDialogue = null
      return
    }
    case 'scene': {
      pending.currentScene = {
        type: 'scene',
        id: first.value,
        line: first.line,
        column: first.column,
        children: []
      }
      pending.currentDialogue = null
      return
    }
    case 'background': {
      if (!pending.currentScene) {
        errors.push({
          message: '背景必须出现在场景块内',
          line: first.line,
          column: first.column,
          severity: 'error'
        })
        return
      }
      pending.currentScene.background = first.value
      return
    }
    case 'bgm': {
      if (!pending.currentScene) {
        errors.push({
          message: 'BGM 必须出现在场景块内',
          line: first.line,
          column: first.column,
          severity: 'error'
        })
        return
      }
      pending.currentScene.bgm = first.value
      return
    }
    case 'sprite':
    case 'position': {
      const spriteToken = line.find((t) => t.type === 'sprite')
      const positionToken = line.find((t) => t.type === 'position')
      if (spriteToken) pending.pendingSprite = spriteToken.value
      if (positionToken) {
        const v = positionToken.value
        pending.pendingPosition =
          v === 'left' || v === '左'
            ? 'left'
            : v === 'right' || v === '右'
              ? 'right'
              : v === 'center' || v === '中'
                ? 'center'
                : undefined
      }
      return
    }
    case 'set': {
      const parts = first.value.split('|')
      const name = parts[0] ?? ''
      const op = parseSetOp(parts[1] ?? 'set')
      const exprSrc = parts.slice(2).join('|')
      const value = parseExprToken(exprSrc, first.line, first.column, errors, '设:')
      if (!value) return
      const setNode: SetNode = {
        type: 'set',
        name,
        op,
        value,
        line: first.line,
        column: first.column
      }
      pushNode(ctx, setNode)
      return
    }
    case 'if': {
      const condition = parseExprToken(first.value, first.line, first.column, errors, '若:')
      const ifNode: IfNode = {
        type: 'if',
        line: first.line,
        column: first.column,
        branches: [{ kind: 'if', ...(condition !== undefined ? { condition } : {}), children: [] }]
      }
      ctx.ifStack.push({ node: ifNode, branchIndex: 0 })
      return
    }
    case 'elif': {
      const frame = ctx.ifStack[ctx.ifStack.length - 1]
      if (!frame) {
        errors.push({
          message: '[否则若:] 缺少匹配的 [若:]',
          line: first.line,
          column: first.column,
          severity: 'warning'
        })
        return
      }
      const condition = parseExprToken(first.value, first.line, first.column, errors, '否则若:')
      frame.node.branches.push({
        kind: 'elif',
        ...(condition !== undefined ? { condition } : {}),
        children: []
      })
      frame.branchIndex = frame.node.branches.length - 1
      return
    }
    case 'else': {
      const frame = ctx.ifStack[ctx.ifStack.length - 1]
      if (!frame) {
        errors.push({
          message: '[否则] 缺少匹配的 [若:]',
          line: first.line,
          column: first.column,
          severity: 'warning'
        })
        return
      }
      frame.node.branches.push({ kind: 'else', children: [] })
      frame.branchIndex = frame.node.branches.length - 1
      return
    }
    case 'endif': {
      const frame = ctx.ifStack.pop()
      if (!frame) {
        errors.push({
          message: '[若终] 缺少匹配的 [若:]',
          line: first.line,
          column: first.column,
          severity: 'warning'
        })
        return
      }
      pushNode(ctx, frame.node)
      return
    }
    case 'dialogue': {
      const textToken = line.find((t) => t.type === 'text')
      const dialogue: DialogueNode = {
        type: 'dialogue',
        character: first.value,
        line: first.line,
        column: first.column,
        lines: textToken ? [textToken.value] : [],
        sprite: pending.pendingSprite,
        position: pending.pendingPosition
      }
      pushNode(ctx, dialogue)
      pending.currentDialogue = dialogue
      return
    }
    case 'choice': {
      const targetToken = line.find((t) => t.type === 'goto')
      const whenToken = line.find((t) => t.type === 'when')
      const condition = whenToken
        ? parseExprToken(whenToken.value, whenToken.line, whenToken.column, errors, '当:')
        : undefined
      const choice: ChoiceNode = {
        type: 'choice',
        line: first.line,
        column: first.column,
        options: [
          {
            text: first.value,
            target: targetToken?.value ?? '',
            ...(condition !== undefined ? { condition } : {})
          }
        ]
      }
      if (!targetToken?.value) {
        errors.push({
          message: `选项 "${first.value}" 缺少目标节点 (-> xxx)`,
          line: first.line,
          column: first.column,
          severity: 'warning'
        })
      }
      pushNode(ctx, choice)
      return
    }
    case 'marker': {
      const marker: MarkerNode = {
        type: 'marker',
        id: first.value,
        line: first.line,
        column: first.column
      }
      pushNode(ctx, marker)
      return
    }
    case 'goto': {
      const goto: GotoNode = {
        type: 'goto',
        target: first.value,
        line: first.line,
        column: first.column
      }
      pushNode(ctx, goto)
      return
    }
    case 'comment': {
      return
    }
    default:
      return
  }
}

export const parse = (source: string): Result<ScriptNode> => {
  const errors: ParseError[] = []
  const tokens = tokenize(source)
  const lines = collectLines(tokens)
  const root: ScriptNode = {
    type: 'script',
    line: 1,
    column: 1,
    children: [],
    errors: []
  }
  const ctx: ParseCtx = {
    pending: {
      currentScene: null,
      currentDialogue: null,
      pendingSprite: undefined,
      pendingPosition: undefined
    },
    errors,
    root,
    ifStack: []
  }

  for (const line of lines) {
    const first = line[0]
    buildLineAst(line, ctx)
    if (first?.type === 'scene' && ctx.pending.currentScene) {
      const scene = ctx.pending.currentScene
      const existingIdx = root.children.findIndex(
        (n) => n.type === 'scene' && n.id === scene.id
      )
      if (existingIdx === -1) {
        root.children.push(scene)
      } else {
        errors.push({
          message: `场景 id "${scene.id}" 重复(L${scene.line}),已合并到首次出现的节点`,
          line: scene.line,
          column: scene.column,
          severity: 'warning'
        })
        const existing = root.children[existingIdx]
        if (existing && existing.type === 'scene') {
          if (scene.background !== undefined) existing.background = scene.background
          if (scene.bgm !== undefined) existing.bgm = scene.bgm
        }
        ctx.pending.currentScene = existing && existing.type === 'scene' ? existing : null
      }
    }
  }

  if (ctx.ifStack.length > 0) {
    for (const frame of [...ctx.ifStack]) {
      errors.push({
        message: `[若:] (L${frame.node.line}) 缺少 [若终]`,
        line: frame.node.line,
        column: frame.node.column,
        severity: 'warning'
      })
      ctx.ifStack.pop()
      if (ctx.pending.currentScene) {
        ctx.pending.currentScene.children.push(frame.node)
      } else {
        root.children.push(frame.node)
      }
    }
  }

  root.errors = errors

  if (errors.some((e) => e.severity === 'error')) {
    return { ok: false, error: errors }
  }
  return { ok: true, value: root }
}

export const collectScenes = (script: ScriptNode): SceneNode[] =>
  script.children.filter((n): n is SceneNode => n.type === 'scene')

export type SceneSummary = {
  id: string
  fileName: string
  title: string
  background?: string
  bgm?: string
}

export const collectSceneSummaries = (script: ScriptNode, fileName: string): SceneSummary[] =>
  collectScenes(script).map((s) => ({
    id: s.id,
    fileName,
    title: s.id,
    background: s.background,
    bgm: s.bgm
  }))
