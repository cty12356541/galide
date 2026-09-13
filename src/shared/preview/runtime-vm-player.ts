/**
 * runtime-vm-player — 浏览器可嵌入的 VM 运行函数
 *
 * 这些函数不依赖任何 Node/Electron API,仅操作 plain JS 对象,
 * 因此可以通过 buildPlayerRuntimeFunctions() 序列化为单个自包含字符串,
 * 内联到 Web 导出的 HTML <script> 中。
 */
import type { Expression } from '../dsl/expression'
import type {
  PlaybackChoiceOption,
  PlaybackIfStep,
  PlaybackSetStep,
  PlaybackStep
} from './playback-timeline'
import type { VmAdvanceResult, VmGraph, VmJumpResult, VmState } from './runtime-vm'

export const MAX_VM_HISTORY = 100

export interface VmHistoryEntry {
  sceneId: string
  stepIndex: number
  variables: Record<string, unknown>
  branchQueue?: PlaybackStep[]
}

export function pushHistory(state: VmState): VmState {
  const entry: VmHistoryEntry = {
    sceneId: state.sceneId,
    stepIndex: state.stepIndex,
    variables: { ...state.variables },
    ...(state.branchQueue !== undefined ? { branchQueue: state.branchQueue } : {})
  }
  const nextHistory = [...(state.history ?? []), entry]
  if (nextHistory.length > MAX_VM_HISTORY) {
    nextHistory.shift()
  }
  return { ...state, history: nextHistory }
}

export function stepBack(state: VmState): VmState {
  const history = state.history ?? []
  if (history.length === 0) return state
  const entry = history.at(-1)
  if (!entry) return state
  const rest = history.slice(0, -1)
  return {
    sceneId: entry.sceneId,
    stepIndex: entry.stepIndex,
    variables: entry.variables,
    ...(entry.branchQueue !== undefined ? { branchQueue: entry.branchQueue } : {}),
    history: rest
  }
}

export function evaluateValueImpl(
  expr: Expression,
  vars: Record<string, unknown>
): unknown {
  switch (expr.kind) {
    case 'literal':
      return expr.value
    case 'var':
      return vars[expr.name] !== undefined ? vars[expr.name] : null
    case 'unary':
      if (expr.op === 'not') return !evaluateConditionImpl(expr.arg, vars)
      return null
    case 'binary': {
      if (expr.op === 'and')
        return evaluateConditionImpl(expr.left, vars) && evaluateConditionImpl(expr.right, vars)
      if (expr.op === 'or')
        return evaluateConditionImpl(expr.left, vars) || evaluateConditionImpl(expr.right, vars)
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

export function evaluateConditionImpl(
  expr: Expression,
  vars: Record<string, unknown>
): boolean {
  const v = evaluateValueImpl(expr, vars)
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') return v.length > 0
  return false
}

export function applySetStepImpl(state: VmState, step: PlaybackSetStep): VmState {
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

export function resolveIfStepImpl(state: VmState, step: PlaybackIfStep): PlaybackStep[] {
  for (const branch of step.branches) {
    if (branch.kind === 'else') return branch.steps
    if (branch.condition !== undefined && evaluateConditionImpl(branch.condition, state.variables)) {
      return branch.steps
    }
  }
  return []
}

export function filterChoiceOptionsImpl(
  options: PlaybackChoiceOption[],
  variables: Record<string, unknown>
): PlaybackChoiceOption[] {
  return options.filter(
    (o) => o.condition === undefined || evaluateConditionImpl(o.condition, variables)
  )
}

export const applySetStep = applySetStepImpl
export const resolveIfStep = resolveIfStepImpl
export const filterChoiceOptions = filterChoiceOptionsImpl

export function advancePastIf(graph: VmGraph, state: VmState): VmState {
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

export function jumpToTargetImpl(
  graph: VmGraph,
  state: VmState,
  target: string
): VmJumpResult {
  const resolved = resolveTargetImpl(graph, target)
  if (!resolved) {
    return { ok: false, error: `无效跳转目标: ${target}` }
  }
  return {
    ok: true,
    state: {
      ...pushHistory(state),
      sceneId: resolved.sceneId,
      stepIndex: resolved.stepIndex,
      branchQueue: undefined
    }
  }
}

export function executeGotoStepImpl(
  graph: VmGraph,
  state: VmState,
  step: { target: string }
): VmJumpResult {
  return jumpToTargetImpl(graph, state, step.target)
}

export function advanceVmImpl(graph: VmGraph, state: VmState): VmAdvanceResult {
  const scene = graph.scenes[state.sceneId]
  if (!scene) {
    return { ok: false, error: `未知场景: ${state.sceneId}` }
  }

  let next = pushHistory(state)

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
    return { ok: true, state: { ...next, stepIndex: nextIndex }, finished: true }
  }
  return {
    ok: true,
    state: { ...next, stepIndex: nextIndex },
    finished: false
  }
}

// =================== 回看日志(backlog)与已读状态(read state) ===================
// 同样为浏览器可嵌入实现:仅操作 plain 对象,经 buildPlayerRuntimeFunctions()
// 序列化进 Web 导出;preview 与 web 共享同一语义。

export interface VmBacklogEntry {
  sceneId: string
  character: string
  text: string
}

/** 对话稳定 id:场景 + 角色 + 文本(内容编辑后失效,属预期) */
export function dialogueLineIdImpl(sceneId: string, character: string, text: string): string {
  return `${sceneId}\u0000${character}\u0000${text}`
}

/** 从 undo 历史推导对白回看列表(过滤非 dialogue 步) */
export function buildBacklogImpl(graph: VmGraph, state: VmState): VmBacklogEntry[] {
  const out: VmBacklogEntry[] = []
  const hist = state.history ?? []
  for (const h of hist) {
    let step: PlaybackStep | undefined
    if (h.branchQueue && h.branchQueue.length > 0) {
      step = h.branchQueue[0]
    } else {
      const scene = graph.scenes[h.sceneId]
      const steps = scene ? scene.steps : undefined
      step = steps ? steps[h.stepIndex] : undefined
    }
    if (step && step.type === 'dialogue') {
      out.push({ sceneId: h.sceneId, character: step.character, text: step.text })
    }
  }
  return out
}

/** 全局已读记录(跨存档槽,序列化为 JSON 数组) */
export interface VmReadState {
  readLineIds: string[]
}

export const MAX_READ_LINE_IDS = 20000

export function markReadImpl(read: VmReadState, lineId: string): VmReadState {
  if (read.readLineIds.indexOf(lineId) >= 0) return read
  const next = [...read.readLineIds, lineId]
  if (next.length > MAX_READ_LINE_IDS) {
    next.splice(0, next.length - MAX_READ_LINE_IDS)
  }
  return { readLineIds: next }
}

export function isReadImpl(read: VmReadState, lineId: string): boolean {
  return read.readLineIds.indexOf(lineId) >= 0
}

/** 舞台槽位:角色 → 立绘/位置(多角色同屏) */
export interface VmStageSlot {
  sprite?: string
  position?: 'left' | 'right' | 'center'
}

/**
 * 从场景开头重放到当前位置,推导多角色舞台状态。
 * 纯函数、确定性:对(场景, 位置)可重算,天然兼容存档/跳转/历史;
 * 场景切换时舞台清空(与 VN 惯例一致)。
 */
export function computeStageStateImpl(
  graph: VmGraph,
  state: VmState
): Record<string, VmStageSlot> {
  const stage: Record<string, VmStageSlot> = {}
  const scene = graph.scenes[state.sceneId]
  if (!scene) return stage
  const branch = state.branchQueue ?? []
  const walk = (steps: readonly PlaybackStep[], upto: number): void => {
    for (let i = 0; i < upto; i++) {
      const step = steps[i]
      if (!step) continue
      if (step.type === 'stage') {
        if (step.action === 'enter') {
          stage[step.character] = {
            ...(step.sprite !== undefined ? { sprite: step.sprite } : {}),
            ...(step.position !== undefined ? { position: step.position } : {})
          }
        } else {
          delete stage[step.character]
        }
      } else if (step.type === 'dialogue' && step.sprite) {
        // 说话角色的立绘更新自己的槽位(粘性)
        const prev = stage[step.character]
        stage[step.character] = {
          sprite: step.sprite,
          position: step.position ?? prev?.position
        }
      }
    }
  }
  if (branch.length > 0) {
    // if 分支内:主时间线走到 if 步(其 index 在 branchQueue 之前的边界),
    // 再叠加分支队列中已消费与当前步之前的 stage 变化
    const ifIdx = findIfBoundary(scene.steps, state.stepIndex)
    walk(scene.steps, ifIdx + 1)
    walk(branch, branch.length)
  } else {
    walk(scene.steps, state.stepIndex + 1)
  }
  return stage
}

/** 状态指向 if 分支内部时,定位主时间线上的 if 步索引 */
function findIfBoundary(steps: readonly PlaybackStep[], stateIndex: number): number {
  for (let i = 0; i < stateIndex && i < steps.length; i++) {
    const st = steps[i]
    if (st && st.type === 'if') return i
  }
  return stateIndex
}

export const resolveTarget = resolveTargetImpl
export const getCurrentStep = getCurrentStepImpl
export const jumpToTarget = jumpToTargetImpl
export const executeGotoStep = executeGotoStepImpl
export const advanceVm = advanceVmImpl

/** Browser-embeddable VM functions for web export inline script. */
export function buildPlayerRuntimeFunctions(): string {
  return [
    `const MAX_VM_HISTORY = ${MAX_VM_HISTORY};`,
    pushHistory.toString(),
    stepBack.toString(),
    evaluateValueImpl.toString(),
    evaluateConditionImpl.toString(),
    applySetStepImpl.toString(),
    resolveIfStepImpl.toString(),
    filterChoiceOptionsImpl.toString(),
    'const applySetStep = applySetStepImpl;',
    'const resolveIfStep = resolveIfStepImpl;',
    'const filterChoiceOptions = filterChoiceOptionsImpl;',
    advancePastIf.toString(),
    resolveTargetImpl.toString(),
    getCurrentStepImpl.toString(),
    jumpToTargetImpl.toString(),
    executeGotoStepImpl.toString(),
    advanceVmImpl.toString(),
    'const resolveTarget = resolveTargetImpl;',
    'const getCurrentStep = getCurrentStepImpl;',
    'const jumpToTarget = jumpToTargetImpl;',
    'const executeGotoStep = executeGotoStepImpl;',
    'const advanceVm = advanceVmImpl;',
    dialogueLineIdImpl.toString(),
    buildBacklogImpl.toString(),
    computeStageStateImpl.toString(),
    findIfBoundary.toString(),
    'const computeStageState = computeStageStateImpl;',
    'const dialogueLineId = dialogueLineIdImpl;',
    'const buildBacklog = buildBacklogImpl;',
    `const MAX_READ_LINE_IDS = ${MAX_READ_LINE_IDS};`,
    markReadImpl.toString(),
    isReadImpl.toString(),
    'const markRead = markReadImpl;',
    'const isRead = isReadImpl;'
  ].join('\n\n')
}
