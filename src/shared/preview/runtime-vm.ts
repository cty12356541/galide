import type { ScriptNode, SceneNode } from '../dsl/types'
import { collectNodes } from '../dsl/visitor'
import {
  buildPlaybackTimeline,
  type PlaybackChoiceOption,
  type PlaybackIfStep,
  type PlaybackSetStep,
  type PlaybackStep
} from './playback-timeline'

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
}

export type VmAdvanceResult =
  | { ok: true; state: VmState; finished: boolean }
  | { ok: false; error: string }

export type VmJumpResult =
  | { ok: true; state: VmState }
  | { ok: false; error: string }

/** @internal Browser-embeddable — expression value eval (no parse, AST only) */
export function evaluateValueImpl(expr, vars) {
  switch (expr.kind) {
    case 'literal':
      return expr.value
    case 'var':
      return vars[expr.name] !== undefined ? vars[expr.name] : null
    case 'unary':
      if (expr.op === 'not') return !evaluateConditionImpl(expr.arg, vars)
      return null
    case 'binary': {
      if (expr.op === 'and') return evaluateConditionImpl(expr.left, vars) && evaluateConditionImpl(expr.right, vars)
      if (expr.op === 'or') return evaluateConditionImpl(expr.left, vars) || evaluateConditionImpl(expr.right, vars)
      const l = evaluateValueImpl(expr.left, vars)
      const r = evaluateValueImpl(expr.right, vars)
      if (expr.op === 'eq') return l === r
      if (expr.op === 'ne') return l !== r
      const ln = Number(l)
      const rn = Number(r)
      if (Number.isNaN(ln) || Number.isNaN(rn)) return false
      if (expr.op === 'lt') return ln < rn
      if (expr.op === 'le') return ln <= rn
      if (expr.op === 'gt') return ln > rn
      if (expr.op === 'ge') return ln >= rn
      return false
    }
    default:
      return null
  }
}

/** @internal Browser-embeddable */
export function evaluateConditionImpl(expr, vars) {
  const v = evaluateValueImpl(expr, vars)
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') return v.length > 0
  return false
}

/** Apply a set step to VM variable state. */
export function applySetStepImpl(state, step) {
  const raw = evaluateValueImpl(step.value, state.variables)
  const vars = { ...state.variables }
  if (step.op === 'set') {
    if (raw !== null) vars[step.name] = raw
  } else {
    const current = Number(vars[step.name] ?? 0)
    const delta = Number(raw ?? 0)
    if (step.op === 'add') vars[step.name] = current + delta
    else vars[step.name] = current - delta
  }
  return { ...state, variables: vars }
}

export const applySetStep = applySetStepImpl as (
  state: VmState,
  step: PlaybackSetStep
) => VmState

/** Resolve which branch steps execute for an if step. */
export function resolveIfStepImpl(state, step) {
  for (const branch of step.branches) {
    if (branch.kind === 'else') return branch.steps
    if (branch.condition !== undefined && evaluateConditionImpl(branch.condition, state.variables)) {
      return branch.steps
    }
  }
  return []
}

export const resolveIfStep = resolveIfStepImpl as (
  state: VmState,
  step: PlaybackIfStep
) => PlaybackStep[]

/** Filter choice options by optional [当:] conditions. */
export function filterChoiceOptionsImpl(options, variables) {
  return options.filter(
    (o) => o.condition === undefined || evaluateConditionImpl(o.condition, variables)
  )
}

export const filterChoiceOptions = filterChoiceOptionsImpl as (
  options: PlaybackChoiceOption[],
  variables: Record<string, unknown>
) => PlaybackChoiceOption[]

/** @internal Browser-embeddable — no type annotations */
export function getCurrentStepImpl(graph: VmGraph, state: VmState): PlaybackStep | null {
  if (state.branchQueue && state.branchQueue.length > 0) {
    return state.branchQueue[0] ?? null
  }
  const scene = graph.scenes[state.sceneId]
  if (!scene) return null
  const step = scene.steps[state.stepIndex] ?? null
  if (step?.type === 'if') {
    const branchSteps = resolveIfStep(state, step)
    if (branchSteps.length === 0) return null
    return branchSteps[0] ?? null
  }
  if (step?.type === 'choice') {
    const visible = filterChoiceOptions(step.options, state.variables)
    if (visible.length === 0) return null
    return { type: 'choice', options: visible }
  }
  return step
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
      stepIndex: resolved.stepIndex,
      branchQueue: undefined
    }
  }
}

export const jumpToTarget = jumpToTargetImpl

/** @internal Browser-embeddable */
export function executeGotoStepImpl(
  graph: VmGraph,
  state: VmState,
  step: { target: string }
): VmJumpResult {
  return jumpToTargetImpl(graph, state, step.target)
}

export const executeGotoStep = executeGotoStepImpl

const advancePastIf = (graph: VmGraph, state: VmState): VmState => {
  const scene = graph.scenes[state.sceneId]
  if (!scene) return state
  const step = scene.steps[state.stepIndex]
  if (step?.type !== 'if') return state
  const branchSteps = resolveIfStep(state, step)
  if (branchSteps.length === 0) {
    return { ...state, stepIndex: state.stepIndex + 1, branchQueue: undefined }
  }
  const [first, ...rest] = branchSteps
  if (first?.type === 'set') {
    const next = applySetStep(state, first)
    if (rest.length === 0) {
      return { ...next, stepIndex: state.stepIndex + 1, branchQueue: undefined }
    }
    return { ...next, branchQueue: rest }
  }
  if (rest.length === 0) {
    return { ...state, branchQueue: [first!] }
  }
  return { ...state, branchQueue: branchSteps }
}

/** @internal Browser-embeddable */
export function advanceVmImpl(graph: VmGraph, state: VmState): VmAdvanceResult {
  const scene = graph.scenes[state.sceneId]
  if (!scene) {
    return { ok: false, error: `未知场景: ${state.sceneId}` }
  }

  let next = { ...state }

  if (next.branchQueue && next.branchQueue.length > 0) {
    const [current, ...remaining] = next.branchQueue
    if (current?.type === 'set') {
      next = applySetStep(next, current)
    }
    if (remaining.length > 0) {
      return { ok: true, state: { ...next, branchQueue: remaining }, finished: false }
    }
    const mainStep = scene.steps[next.stepIndex]
    if (mainStep?.type === 'if') {
      return {
        ok: true,
        state: { ...next, stepIndex: next.stepIndex + 1, branchQueue: undefined },
        finished: false
      }
    }
    return { ok: true, state: { ...next, branchQueue: undefined }, finished: false }
  }

  const current = scene.steps[next.stepIndex]
  if (current?.type === 'set') {
    next = applySetStep(next, current)
    const nextIndex = next.stepIndex + 1
    if (nextIndex >= scene.steps.length) {
      return { ok: true, state: { ...next, stepIndex: nextIndex }, finished: true }
    }
    return { ok: true, state: { ...next, stepIndex: nextIndex }, finished: false }
  }

  if (current?.type === 'if') {
    const afterIf = advancePastIf(graph, next)
    if (afterIf.branchQueue && afterIf.branchQueue.length > 0) {
      return { ok: true, state: afterIf, finished: false }
    }
    const nextIndex = afterIf.stepIndex
    if (nextIndex >= scene.steps.length) {
      return { ok: true, state: afterIf, finished: true }
    }
    return { ok: true, state: afterIf, finished: false }
  }

  const nextIndex = next.stepIndex + 1
  if (nextIndex >= scene.steps.length) {
    return { ok: true, state: next, finished: true }
  }
  return {
    ok: true,
    state: { ...next, stepIndex: nextIndex },
    finished: false
  }
}

export const advanceVm = advanceVmImpl

/** Browser-embeddable VM functions for web export inline script. */
export function buildPlayerRuntimeFunctions(): string {
  return [
    evaluateValueImpl.toString(),
    evaluateConditionImpl.toString(),
    applySetStepImpl.toString(),
    resolveIfStepImpl.toString(),
    filterChoiceOptionsImpl.toString(),
    resolveTargetImpl.toString(),
    getCurrentStepImpl.toString(),
    jumpToTargetImpl.toString(),
    executeGotoStepImpl.toString(),
    advanceVmImpl.toString(),
    'const evaluateValue = evaluateValueImpl;',
    'const evaluateCondition = evaluateConditionImpl;',
    'const applySetStep = applySetStepImpl;',
    'const resolveIfStep = resolveIfStepImpl;',
    'const filterChoiceOptions = filterChoiceOptionsImpl;',
    'const resolveTarget = resolveTargetImpl;',
    'const getCurrentStep = getCurrentStepImpl;',
    'const jumpToTarget = jumpToTargetImpl;',
    'const executeGotoStep = executeGotoStepImpl;',
    'const advanceVm = advanceVmImpl;'
  ].join('\n\n')
}
