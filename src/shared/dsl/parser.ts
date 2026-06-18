/**
 * gal DSL 语法分析器
 * 输入: Token[]
 * 输出: ScriptAST + ParseError[]
 *
 * 解析失败不抛异常,返回结构化错误
 */

import type {
  ChoiceNode,
  DialogueNode,
  GotoNode,
  MarkerNode,
  ParseError,
  Result,
  SceneNode,
  ScriptNode,
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

const buildLineAst = (line: Token[], pending: Pending, errors: ParseError[], root: ScriptNode): void => {
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
      // 立绘舞台行:扫描行内 sprite / position token,更新 pending
      // galgame 语义:持续到下次 sprite 行改变,后续 dialogue 继承
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
      if (pending.currentScene) {
        pending.currentScene.children.push(dialogue)
      } else {
        // scene 外的 dialogue 挂到 root 平铺层(方向 B:不再静默丢弃)
        root.children.push(dialogue)
      }
      pending.currentDialogue = dialogue
      return
    }
    case 'choice': {
      const targetToken = line.find((t) => t.type === 'goto')
      const choice: ChoiceNode = {
        type: 'choice',
        line: first.line,
        column: first.column,
        options: [
          {
            text: first.value,
            target: targetToken?.value ?? ''
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
      if (pending.currentScene) {
        pending.currentScene.children.push(choice)
      } else {
        root.children.push(choice)
      }
      return
    }
    case 'marker': {
      const marker: MarkerNode = {
        type: 'marker',
        id: first.value,
        line: first.line,
        column: first.column
      }
      if (pending.currentScene) {
        pending.currentScene.children.push(marker)
      } else {
        // scene 外的 marker 挂到 root 平铺层(跨场景跳转目标)
        root.children.push(marker)
      }
      return
    }
    case 'goto': {
      const goto: GotoNode = {
        type: 'goto',
        target: first.value,
        line: first.line,
        column: first.column
      }
      if (pending.currentScene) {
        pending.currentScene.children.push(goto)
      } else {
        root.children.push(goto)
      }
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
  const pending: Pending = {
    currentScene: null,
    currentDialogue: null,
    pendingSprite: undefined,
    pendingPosition: undefined
  }

  for (const line of lines) {
    const first = line[0]
    buildLineAst(line, pending, errors, root)
    // P1-5 修复: 仅在 scene 行(new scene 进入时)做"是否已存在"判定与合并,
    // 不能每行都做 — 否则 pending.currentScene 在对话/选项行已经累积了 children,
    // 合并会触发自引用数组展开,导致 children 长度指数级翻倍。
    if (first?.type === 'scene' && pending.currentScene) {
      const scene = pending.currentScene
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
        // 合并策略: 把当前 scene(空 children,刚被 buildLineAst 重置)的 background/bgm
        // 写到 existing 节点;后续 dialogue/choice/goto 由 pending.currentScene 仍
        // 指向 existing(rebind),所以不会再走 root.children.push,也不再产生新 children 引用。
        const existing = root.children[existingIdx]
        if (existing && existing.type === 'scene') {
          if (scene.background !== undefined) existing.background = scene.background
          if (scene.bgm !== undefined) existing.bgm = scene.bgm
        }
        pending.currentScene = existing && existing.type === 'scene' ? existing : null
      }
    } else if (first?.type === 'scene' && !pending.currentScene) {
      // 正常 case: scene 行但 pending 没建立(应该不会发生,buildLineAst 已建)
    }
  }

  // P2-11: 把 errors 也存到 ScriptNode 上(规约要求 errors: ParseError[])
  root.errors = errors

  if (errors.some((e) => e.severity === 'error')) {
    return { ok: false, error: errors }
  }
  return { ok: true, value: root }
}

export const collectScenes = (script: ScriptNode): SceneNode[] =>
  script.children.filter((n): n is SceneNode => n.type === 'scene')

/**
 * 场景摘要(供 UI 消费):从 .gal AST 派生,
 * 不写入 .galproj,符合 core/conventions.yaml "决策树在 .gal" 的规约。
 *
 * 用法:
 *   import { collectScenes, collectSceneSummaries } from '@shared/dsl/parser'
 *   const summaries = collectSceneSummaries(ast, 'chapter1.gal')
 *
 * 若需要 IPC 派生版本(基于 .galproj 目录扫描),参考 .style-spec/layers/dsl/conventions.yaml
 * 由 renderer 端在 useScript 之上自行组合。
 */
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
