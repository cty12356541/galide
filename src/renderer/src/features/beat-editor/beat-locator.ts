import { collectNodes } from '../../../../shared/dsl/visitor'
import type { AstNode, SceneNode, ScriptNode } from '../../../../shared/dsl/types'

export type BeatLocatorStep =
  | { kind: 'into-child'; index: number }
  | { kind: 'into-branch'; branchIndex: number }

export type BeatLocator = BeatLocatorStep[]

/** 按 locator 定位到可编辑的 children 数组(嵌套 if 分支) */
export const resolveBeatChildren = (scene: SceneNode, locator: BeatLocator): AstNode[] | null => {
  let current = scene.children
  let i = 0
  while (i < locator.length) {
    const childStep = locator[i]
    if (!childStep || childStep.kind !== 'into-child') return null
    const node = current[childStep.index]
    if (node?.type !== 'if') return null
    const branchStep = locator[i + 1]
    if (!branchStep || branchStep.kind !== 'into-branch') return null
    const branch = node.branches[branchStep.branchIndex]
    if (!branch) return null
    current = branch.children
    i += 2
  }
  return current
}

/** 在 AST 上按 locator 改写对应 children 数组 */
export const mutateBeatChildren = (
  ast: ScriptNode,
  sceneId: string,
  locator: BeatLocator,
  fn: (children: AstNode[]) => void
): void => {
  const scene = collectNodes(ast, (n): n is SceneNode => n.type === 'scene').find(
    (s) => s.id === sceneId
  )
  if (!scene) return
  const arr = resolveBeatChildren(scene, locator)
  if (!arr) return
  fn(arr)
}
