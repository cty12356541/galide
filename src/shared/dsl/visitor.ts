/**
 * gal DSL AST Visitor
 *
 * 决策树遍历的标准入口(core/patterns.yaml:26-34)。
 * - walkScript: 深度优先遍历,parent 在前、child 在后
 * - collectNodes: 按谓词收集节点
 * - countByType: 统计每种类型节点数量
 * - findById: 按 id 查找节点(scene.id / marker.id)
 *
 * 任何"遍历决策树"的代码应走这些函数,手写 for/of 只在 visitor 内部出现。
 */

import type {
  AstNode,
  ChoiceNode,
  CommentNode,
  DialogueNode,
  GotoNode,
  IfNode,
  MarkerNode,
  SceneNode,
  ScriptNode,
  SetNode
} from './types.js'

/** ScriptVisitor — 经典 Visitor 模式 */
export interface ScriptVisitor<T> {
  visitScript?(node: ScriptNode): T
  visitScene?(node: SceneNode): T
  visitDialogue?(node: DialogueNode): T
  visitChoice?(node: ChoiceNode): T
  visitSet?(node: SetNode): T
  visitIf?(node: IfNode): T
  visitGoto?(node: GotoNode): T
  visitMarker?(node: MarkerNode): T
  visitComment?(node: CommentNode): T
}

const isParentNode = (n: AstNode): n is ScriptNode | SceneNode | IfNode =>
  n.type === 'script' || n.type === 'scene' || n.type === 'if'

const childNodes = (n: ScriptNode | SceneNode | IfNode): AstNode[] =>
  n.type === 'if' ? n.branches.flatMap((b) => b.children) : n.children

/** 任何可作为遍历起点的节点(ScriptNode 或 SceneNode,均有 children) */
export type AstRoot = ScriptNode | SceneNode

/**
 * 深度优先遍历,parent 在前、child 在后(parent-first DFS)。
 * - 每次进入节点时调用 visitor 对应方法
 * - 返回的 T 全部收集到数组
 * - 任何未实现的 visitXxx 不会推送结果
 */
export function walkScript<T>(ast: ScriptNode, visitor: ScriptVisitor<T>): T[] {
  const results: T[] = []
  const visit = (n: AstNode): void => {
    let value: T | undefined
    switch (n.type) {
      case 'script':
        value = visitor.visitScript?.(n)
        break
      case 'scene':
        value = visitor.visitScene?.(n)
        break
      case 'dialogue':
        value = visitor.visitDialogue?.(n)
        break
      case 'choice':
        value = visitor.visitChoice?.(n)
        break
      case 'set':
        value = visitor.visitSet?.(n)
        break
      case 'if':
        value = visitor.visitIf?.(n)
        break
      case 'goto':
        value = visitor.visitGoto?.(n)
        break
      case 'marker':
        value = visitor.visitMarker?.(n)
        break
      case 'comment':
        value = visitor.visitComment?.(n)
        break
    }
    if (value !== undefined) results.push(value)
    if (isParentNode(n)) {
      for (const child of childNodes(n)) visit(child)
    }
  }
  visit(ast)
  return results
}

/**
 * 按谓词收集节点,DFS 序。
 * 支持 type guard predicate 自动收窄返回类型。
 * root 可为 ScriptNode 或 SceneNode(任何含 children 的节点)。
 */
export function collectNodes<T extends AstNode>(
  root: AstRoot,
  predicate: (n: AstNode) => n is T
): T[]
export function collectNodes(root: AstRoot, predicate: (n: AstNode) => boolean): AstNode[]
export function collectNodes(
  root: AstRoot,
  predicate: (n: AstNode) => boolean
): AstNode[] {
  const out: AstNode[] = []
  const visit = (n: AstNode): void => {
    if (predicate(n)) out.push(n)
    if (isParentNode(n)) {
      for (const child of childNodes(n)) visit(child)
    }
  }
  visit(root)
  return out
}

export type NodeType = AstNode['type']

/** 统计每种 type 节点的数量,key 为 NodeType */
export const countByType = (root: AstRoot): Record<NodeType, number> => {
  const counts: Record<NodeType, number> = {
    script: 0,
    scene: 0,
    dialogue: 0,
    choice: 0,
    set: 0,
    if: 0,
    goto: 0,
    marker: 0,
    comment: 0
  }
  const visit = (n: AstNode): void => {
    counts[n.type] += 1
    if (isParentNode(n)) {
      for (const child of childNodes(n)) visit(child)
    }
  }
  visit(root)
  return counts
}

/**
 * 按 id 查找节点。
 * - scene 用 scene.id
 * - marker 用 marker.id
 * 命中即返回,DFS 序
 */
export const findById = (root: AstRoot, id: string): AstNode | undefined => {
  const visit = (n: AstNode): AstNode | undefined => {
    if (n.type === 'scene' || n.type === 'marker') {
      if (n.id === id) return n
    }
    if (isParentNode(n)) {
      for (const child of childNodes(n)) {
        const hit = visit(child)
        if (hit) return hit
      }
    }
    return undefined
  }
  return visit(root)
}
