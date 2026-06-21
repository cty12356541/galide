/**
 * decision-tree — 决策树静态分析(纯函数,基于 walkScript)
 *
 * 复用面:Phase 2 的确定性可达性 Critic(非 LLM)+ Phase 4 的决策树分析工具。
 * 不触网、不读盘,只对 ScriptNode AST 做图分析。
 */
import { collectScenes } from '../../../shared/dsl/parser.js'
import { collectNodes } from '../../../shared/dsl/visitor.js'
import type {
  AstNode,
  ChoiceNode,
  GotoNode,
  MarkerNode,
  ScriptNode,
  SceneNode
} from '../../../shared/dsl/types.js'

export interface ReachabilityReport {
  /** 入口节点(首个场景 id),空剧本为 null */
  entry: string | null
  reachable: string[]
  unreachable: string[]
  danglingTargets: { from: string; target: string }[]
}

const isChoice = (n: AstNode): n is ChoiceNode => n.type === 'choice'
const isGoto = (n: AstNode): n is GotoNode => n.type === 'goto'
const isMarker = (n: AstNode): n is MarkerNode => n.type === 'marker'

/** 一个场景的出边目标(去重) */
const outgoingTargets = (sceneNode: SceneNode): string[] => {
  const targets: string[] = []
  for (const c of collectNodes(sceneNode, isChoice)) {
    for (const opt of c.options) if (opt.target) targets.push(opt.target)
  }
  for (const g of collectNodes(sceneNode, isGoto)) {
    if (g.target) targets.push(g.target)
  }
  return [...new Set(targets)]
}

export const analyzeReachability = (ast: ScriptNode): ReachabilityReport => {
  const scenes = collectScenes(ast)
  // 所有可作为跳转目标的 id:场景 id + 标记 id
  const markerIds = collectNodes(ast, isMarker).map((m) => m.id)
  const allIds = new Set<string>([...scenes.map((s) => s.id), ...markerIds])

  if (scenes.length === 0) {
    return { entry: null, reachable: [], unreachable: [], danglingTargets: [] }
  }

  const adjacency = new Map<string, string[]>()
  const dangling: { from: string; target: string }[] = []
  for (const s of scenes) {
    const targets = outgoingTargets(s)
    adjacency.set(s.id, targets)
    for (const t of targets) {
      if (!allIds.has(t)) dangling.push({ from: s.id, target: t })
    }
  }

  const entry = scenes[0]?.id ?? null
  const reachable = new Set<string>()
  if (entry) {
    const queue: string[] = [entry]
    while (queue.length > 0) {
      const id = queue.shift() as string
      if (reachable.has(id)) continue
      reachable.add(id)
      for (const next of adjacency.get(id) ?? []) {
        if (allIds.has(next) && !reachable.has(next)) queue.push(next)
      }
    }
  }

  const unreachable = [...allIds].filter((id) => !reachable.has(id))
  return {
    entry,
    reachable: [...reachable],
    unreachable,
    danglingTargets: dangling
  }
}
