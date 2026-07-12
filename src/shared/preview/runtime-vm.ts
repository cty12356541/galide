/**
 * runtime-vm — 共享 VM 图构建与状态工厂
 *
 * 本文件只负责:
 *   - 从 Script AST 构建 VM 场景图 (buildVmGraph)
 *   - 创建初始 VM 状态 (createVmState)
 *   - 类型定义 (VmGraph / VmState / VmScene / VmMarkerRef)
 *
 * 所有浏览器可嵌入的运行函数放在 runtime-vm-player.ts,
 * 并通过本文件重新导出以方便现有调用方使用。
 */
import type { ScriptNode, SceneNode } from '../dsl/types'
import { collectNodes } from '../dsl/visitor'
import type { PlaybackStep } from './playback-timeline'
import { buildPlaybackTimeline } from './playback-timeline'
import type { VmHistoryEntry } from './runtime-vm-player'
import {
  MAX_VM_HISTORY,
  advanceVm,
  applySetStep,
  buildPlayerRuntimeFunctions,
  executeGotoStep,
  filterChoiceOptions,
  getCurrentStep,
  jumpToTarget,
  pushHistory,
  resolveIfStep,
  resolveTarget,
  stepBack
} from './runtime-vm-player'

export interface VmScene {
  id: string
  background?: string
  bgm?: string
  steps: PlaybackStep[]
}

export interface VmMarkerRef {
  sceneId: string
  stepIndex: number
}

export interface VmGraph {
  scenes: Record<string, VmScene>
  markers: Record<string, VmMarkerRef>
  sceneOrder: string[]
}

export interface VmState {
  sceneId: string
  stepIndex: number
  variables: Record<string, unknown>
  /** Steps from resolved if-branch, consumed before main timeline */
  branchQueue?: PlaybackStep[]
  history?: VmHistoryEntry[]
}

export type VmAdvanceResult =
  | { ok: true; state: VmState; finished: boolean }
  | { ok: false; error: string }

export type VmJumpResult =
  | { ok: true; state: VmState }
  | { ok: false; error: string }

export {
  MAX_VM_HISTORY,
  pushHistory,
  stepBack,
  resolveTarget,
  getCurrentStep,
  jumpToTarget,
  executeGotoStep,
  advanceVm,
  applySetStep,
  filterChoiceOptions,
  resolveIfStep,
  buildPlayerRuntimeFunctions
}

/** Build a framework-agnostic playback graph from Script AST. */
export const buildVmGraph = (ast: ScriptNode): VmGraph => {
  const scenes = collectNodes(ast, (n): n is SceneNode => n.type === 'scene')
  const graph: VmGraph = { scenes: {}, markers: {}, sceneOrder: [] }

  for (const scene of scenes) {
    graph.sceneOrder.push(scene.id)
    const steps = buildPlaybackTimeline(scene)
    graph.scenes[scene.id] = {
      id: scene.id,
      ...(scene.background !== undefined ? { background: scene.background } : {}),
      ...(scene.bgm !== undefined ? { bgm: scene.bgm } : {}),
      steps
    }
    steps.forEach((step, stepIndex) => {
      if (step.type === 'marker') {
        graph.markers[step.id] = { sceneId: scene.id, stepIndex }
      }
    })
  }

  const globalSteps: PlaybackStep[] = []
  for (const child of ast.children) {
    if (child.type === 'scene') continue
    if (child.type === 'dialogue') {
      for (const line of child.lines) {
        globalSteps.push({
          type: 'dialogue',
          character: child.character,
          text: line,
          ...(child.sprite !== undefined ? { sprite: child.sprite } : {}),
          ...(child.position !== undefined ? { position: child.position } : {})
        })
      }
    } else if (child.type === 'choice') {
      globalSteps.push({
        type: 'choice',
        options: child.options.map((o) => ({
          text: o.text,
          target: o.target,
          ...(o.condition !== undefined ? { condition: o.condition } : {})
        }))
      })
    } else if (child.type === 'goto') {
      globalSteps.push({ type: 'goto', target: child.target })
    } else if (child.type === 'marker') {
      globalSteps.push({ type: 'marker', id: child.id })
    } else if (child.type === 'set') {
      globalSteps.push({ type: 'set', name: child.name, op: child.op, value: child.value })
    } else if (child.type === 'if') {
      globalSteps.push({
        type: 'if',
        branches: child.branches.map((b) => ({
          kind: b.kind,
          ...(b.condition !== undefined ? { condition: b.condition } : {}),
          steps: buildPlaybackTimeline({ type: 'scene', id: '', line: 0, column: 0, children: b.children })
        }))
      })
    }
  }
  if (globalSteps.length > 0) {
    graph.scenes['__global__'] = { id: '__global__', steps: globalSteps }
    graph.sceneOrder.unshift('__global__')
    globalSteps.forEach((step, stepIndex) => {
      if (step.type === 'marker') {
        graph.markers[step.id] = { sceneId: '__global__', stepIndex }
      }
    })
  }

  return graph
}

export const createVmState = (graph: VmGraph, sceneId?: string): VmState => {
  const id = sceneId ?? graph.sceneOrder[0] ?? Object.keys(graph.scenes)[0] ?? ''
  return { sceneId: id, stepIndex: 0, variables: {}, history: [] }
}

export const getCurrentScene = (graph: VmGraph, state: VmState): VmScene | null =>
  graph.scenes[state.sceneId] ?? null
