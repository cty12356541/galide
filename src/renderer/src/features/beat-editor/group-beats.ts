import type {
  AstNode,
  ChoiceNode,
  DialogueNode,
  GotoNode,
  IfBranchKind,
  IfNode,
  MarkerNode,
  SetNode
} from '../../../../shared/dsl/types'
import type { Expression } from '../../../../shared/dsl/expression'

/** 连续 ChoiceNode 合并为一组(对应一段决策) */
export type Beat =
  | { kind: 'dialogue'; node: DialogueNode; index: number }
  | { kind: 'decision'; nodes: ChoiceNode[]; startIndex: number }
  | { kind: 'set'; node: SetNode; index: number }
  | { kind: 'conditional'; node: IfNode; index: number }
  | { kind: 'goto'; node: GotoNode; index: number }
  | { kind: 'marker'; node: MarkerNode; index: number }

/** 把 children 按连续 ChoiceNode 分组为 beat 列表(保留原索引) */
export const groupBeats = (children: AstNode[]): Beat[] => {
  const beats: Beat[] = []
  let i = 0
  while (i < children.length) {
    const node = children[i]
    if (node.type === 'choice') {
      const group: ChoiceNode[] = []
      const start = i
      while (i < children.length && children[i]?.type === 'choice') {
        group.push(children[i] as ChoiceNode)
        i++
      }
      beats.push({ kind: 'decision', nodes: group, startIndex: start })
      continue
    }
    if (node.type === 'dialogue') beats.push({ kind: 'dialogue', node, index: i })
    else if (node.type === 'set') beats.push({ kind: 'set', node, index: i })
    else if (node.type === 'if') beats.push({ kind: 'conditional', node, index: i })
    else if (node.type === 'goto') beats.push({ kind: 'goto', node, index: i })
    else if (node.type === 'marker') beats.push({ kind: 'marker', node, index: i })
    i++
  }
  return beats
}

export interface EditableBranchGroup {
  branchIndex: number
  kind: IfBranchKind
  condition?: Expression
  beats: Beat[]
}

/** 把 IfNode 各分支 children 映射为可编辑 beat 组 */
export const mapIfBranchesToEditableGroups = (ifNode: IfNode): EditableBranchGroup[] =>
  ifNode.branches.map((branch, branchIndex) => ({
    branchIndex,
    kind: branch.kind,
    ...(branch.condition !== undefined ? { condition: branch.condition } : {}),
    beats: groupBeats(branch.children)
  }))
