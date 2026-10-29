import { collectNodes } from '../../../../shared/dsl/visitor'
import type { MarkerNode, SceneNode, ScriptNode } from '../../../../shared/dsl/types'

export interface OutlineMarkerEntry {
  id: string
  line: number
}

export interface OutlineSceneEntry {
  id: string
  line: number
  markers: OutlineMarkerEntry[]
}

export const extractSceneMarkers = (scene: SceneNode): OutlineMarkerEntry[] =>
  collectNodes(scene, (n): n is MarkerNode => n.type === 'marker').map((m) => ({
    id: m.id,
    line: m.line
  }))

/** Derive scene list (with markers) from script AST (same source as SceneRail). */
export const extractOutlineScenes = (scriptAst: ScriptNode | null): OutlineSceneEntry[] => {
  if (!scriptAst) return []
  return collectNodes(scriptAst, (n): n is SceneNode => n.type === 'scene').map((s) => ({
    id: s.id,
    line: s.line,
    markers: extractSceneMarkers(s)
  }))
}
