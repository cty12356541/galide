import type { ScriptNode, SceneNode } from '../dsl/types'
import { collectNodes } from '../dsl/visitor'
import { buildPlaybackTimeline, type PlaybackStep, type PlaybackGotoStep } from './playback-timeline'

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
}

export type VmAdvanceResult =
  | { ok: true; state: VmState; finished: boolean }
  | { ok: false; error: string }

export type VmJumpResult =
  | { ok: true; state: VmState }
  | { ok: false; error: string }

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
      globalSteps.push({ type: 'choice', options: child.options })
    } else if (child.type === 'goto') {
      globalSteps.push({ type: 'goto', target: child.target })
    } else if (child.type === 'marker') {
      globalSteps.push({ type: 'marker', id: child.id })
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
  return { sceneId: id, stepIndex: 0, variables: {} }
}

/** @internal Browser-embeddable — no type annotations */
export function resolveTargetImpl(
  graph: VmGraph,
  target: string
): { sceneId: string; stepIndex: number } | null {
  if (!target) return null
  if (graph.scenes[target]) {
    return { sceneId: target, stepIndex: 0 }
  }
  const marker = graph.markers[target]
  if (marker) return marker
  return null
}

export const resolveTarget = resolveTargetImpl

/** @internal Browser-embeddable */
export function getCurrentStepImpl(graph: VmGraph, state: VmState): PlaybackStep | null {
  const scene = graph.scenes[state.sceneId]
  if (!scene) return null
  return scene.steps[state.stepIndex] ?? null
}

export const getCurrentStep = getCurrentStepImpl

export const getCurrentScene = (graph: VmGraph, state: VmState): VmScene | null =>
  graph.scenes[state.sceneId] ?? null

/** @internal Browser-embeddable */
export function jumpToTargetImpl(graph: VmGraph, state: VmState, target: string): VmJumpResult {
  const resolved = resolveTargetImpl(graph, target)
  if (!resolved) {
    return { ok: false, error: `无效跳转目标: ${target}` }
  }
  return {
    ok: true,
    state: {
      ...state,
      sceneId: resolved.sceneId,
      stepIndex: resolved.stepIndex
    }
  }
}

export const jumpToTarget = jumpToTargetImpl

/** @internal Browser-embeddable */
export function executeGotoStepImpl(
  graph: VmGraph,
  state: VmState,
  step: PlaybackGotoStep
): VmJumpResult {
  return jumpToTargetImpl(graph, state, step.target)
}

export const executeGotoStep = executeGotoStepImpl

/** @internal Browser-embeddable */
export function advanceVmImpl(graph: VmGraph, state: VmState): VmAdvanceResult {
  const scene = graph.scenes[state.sceneId]
  if (!scene) {
    return { ok: false, error: `未知场景: ${state.sceneId}` }
  }
  const nextIndex = state.stepIndex + 1
  if (nextIndex >= scene.steps.length) {
    return { ok: true, state, finished: true }
  }
  return {
    ok: true,
    state: { ...state, stepIndex: nextIndex },
    finished: false
  }
}

export const advanceVm = advanceVmImpl

/** Browser-embeddable VM functions for web export inline script. */
export function buildPlayerRuntimeFunctions(): string {
  return [
    resolveTargetImpl.toString(),
    getCurrentStepImpl.toString(),
    jumpToTargetImpl.toString(),
    executeGotoStepImpl.toString(),
    advanceVmImpl.toString(),
    'const resolveTarget = resolveTargetImpl;',
    'const getCurrentStep = getCurrentStepImpl;',
    'const jumpToTarget = jumpToTargetImpl;',
    'const executeGotoStep = executeGotoStepImpl;',
    'const advanceVm = advanceVmImpl;'
  ].join('\n\n')
}
