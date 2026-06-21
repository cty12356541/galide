import { collectNodes } from '../../../../shared/dsl/visitor'
import type { SceneNode, ScriptNode } from '../../../../shared/dsl/types'

export interface OutlineSceneEntry {
  id: string
  line: number
}

/** Derive scene list from script AST (same source as SceneRail). */
export const extractOutlineScenes = (scriptAst: ScriptNode | null): OutlineSceneEntry[] => {
  if (!scriptAst) return []
  return collectNodes(scriptAst, (n): n is SceneNode => n.type === 'scene').map((s) => ({
    id: s.id,
    line: s.line
  }))
}
