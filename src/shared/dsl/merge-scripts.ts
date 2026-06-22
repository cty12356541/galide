/**
 * mergeScriptAsts — 多 .gal 文件 AST 合并为单一 ScriptNode
 *
 * 与 export web/renpy/ink composer 共用;按 file 名 sort 后 merge,scene ID 冲突后文件覆盖。
 */
import type { SceneNode, ScriptNode } from './types.js'

export type ScriptAstEntry = {
  readonly file: string
  readonly ast: ScriptNode
}

export const mergeScriptAsts = (asts: readonly ScriptAstEntry[]): ScriptNode => {
  const merged: ScriptNode = { type: 'script', line: 1, column: 1, children: [], errors: [] }
  const sorted = [...asts].sort((a, b) => a.file.localeCompare(b.file))
  for (const entry of sorted) {
    for (const child of entry.ast.children) {
      if (child.type === 'scene') {
        const existing = merged.children.findIndex(
          (c) => c.type === 'scene' && (c as SceneNode).id === (child as SceneNode).id
        )
        if (existing >= 0) {
          merged.children[existing] = child
        } else {
          merged.children.push(child)
        }
      } else {
        merged.children.push(child)
      }
    }
  }
  return merged
}
