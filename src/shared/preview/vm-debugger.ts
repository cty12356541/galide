/**
 * vm-debugger — 共享运行时 VM 领域调试原语(断点表 / 变量快照 / watch 订阅 / continue & step)
 *
 * 设计约束(Phase 2 T2-1 + T2-3):
 * - 默认零成本:不修改 advanceVmImpl 热路径;无断点/无 watch 时播放器与 Web 导出零额外开销。
 * - 纯数据可测:仅依赖 runtime-vm / playback-timeline 纯对象与函数,不依赖 Electron 或 DOM。
 */
import type { PlaybackStep } from './playback-timeline'
import type { VmGraph, VmState } from './runtime-vm'
import {
  advanceVm,
  executeGotoStep,
  getCurrentStep,
  resolveIfStep
} from './runtime-vm-player'

export const MAX_DEBUG_CONTINUE_STEPS = 10_000

export interface VmBreakpointHit {
  markerId: string
  sceneId: string
  stepIndex: number
}

export interface VmVariableChange {
  key: string
  previousValue: unknown
  nextValue: unknown
}

export type VmVariableWatchCallback = (
  variables: Record<string, unknown>,
  changes: readonly VmVariableChange[]
) => void

export type VmDebugStopReason =
  | 'breakpoint'
  | 'step'
  | 'choice'
  | 'finished'
  | 'error'

export type VmDebugStepResult =
  | {
      ok: true
      state: VmState
      finished: boolean
      pausedAt: VmBreakpointHit | null
      stopReason: Exclude<VmDebugStopReason, 'error'>
    }
  | {
      ok: false
      error: string
      state: VmState
      pausedAt: VmBreakpointHit | null
      stopReason: 'error'
    }

/** 返回当前 VM 变量表的浅拷贝快照(防止调用方意外篡改运行时状态) */
export const getVariables = (state: VmState): Record<string, unknown> => ({
  ...state.variables
})

/** 计算前后两次变量表的精确差异 */
export const diffVariables = (
  prev: Record<string, unknown>,
  next: Record<string, unknown>
): VmVariableChange[] => {
  const keys = new Set<string>([...Object.keys(prev), ...Object.keys(next)])
  const changes: VmVariableChange[] = []
  for (const key of keys) {
    const previousValue = prev[key]
    const nextValue = next[key]
    if (!Object.is(previousValue, nextValue)) {
      changes.push({ key, previousValue, nextValue })
    }
  }
  return changes
}

/**
 * 检查当前停驻位置是否命中任一断点:
 * - marker 名断点(例如 'checkpoint',支持顶层及 [若:] 分支内 marker)
 * - 位置断点 'sceneId:stepIndex'
 */
export const matchBreakpoint = (
  graph: VmGraph,
  state: VmState,
  breakpoints: ReadonlySet<string>
): VmBreakpointHit | null => {
  if (breakpoints.size === 0) return null
  const step = getCurrentStep(graph, state)
  if (step === null) return null
  if (step.type === 'marker' && breakpoints.has(step.id)) {
    return {
      markerId: step.id,
      sceneId: state.sceneId,
      stepIndex: state.stepIndex
    }
  }
  const locKey = `${state.sceneId}:${state.stepIndex}`
  if ((!state.branchQueue || state.branchQueue.length === 0) && breakpoints.has(locKey)) {
    return {
      markerId: locKey,
      sceneId: state.sceneId,
      stepIndex: state.stepIndex
    }
  }
  return null
}

/**
 * 结算当前位置的静默内部步(if 分支展开、set 赋值、stage 进退场),
 * 使停驻位置始终对齐到可观察步(dialogue / choice / marker / goto)或末尾,
 * 同时确保进入断点时前置 [设:] / [若:] 的变量已求值完毕。
 */
export const settleSilentSteps = (
  graph: VmGraph,
  initialState: VmState,
  onTransition?: (prevVars: Record<string, unknown>, nextVars: Record<string, unknown>) => void
): { ok: true; state: VmState; finished: boolean } | { ok: false; error: string; state: VmState } => {
  let cur = initialState
  let guard = 0
  while (guard < MAX_DEBUG_CONTINUE_STEPS) {
    guard++
    const scene = graph.scenes[cur.sceneId]
    if (!scene) {
      return { ok: false, error: `未知场景: ${cur.sceneId}`, state: cur }
    }

    // 处理嵌套在 branchQueue 队首的 if 步
    if (cur.branchQueue && cur.branchQueue.length > 0 && cur.branchQueue[0]?.type === 'if') {
      const [nestedIf, ...rest] = cur.branchQueue
      const resolved = resolveIfStep(cur, nestedIf)
      const merged: PlaybackStep[] = [...resolved, ...rest]
      if (merged.length > 0) {
        cur = { ...cur, branchQueue: merged }
      } else {
        const mainStep = scene.steps[cur.stepIndex]
        cur = {
          ...cur,
          stepIndex: mainStep?.type === 'if' ? cur.stepIndex + 1 : cur.stepIndex,
          branchQueue: undefined
        }
      }
      continue
    }

    // 主时间线上的 if(尚未展开进 branchQueue)
    const rawStep =
      cur.branchQueue && cur.branchQueue.length > 0 ? undefined : scene.steps[cur.stepIndex]
    const effective = getCurrentStep(graph, cur)

    if (
      rawStep?.type === 'if' ||
      effective?.type === 'set' ||
      effective?.type === 'stage'
    ) {
      const prevVars = cur.variables
      const res = advanceVm(graph, cur)
      if (!res.ok) {
        return { ok: false, error: res.error, state: cur }
      }
      cur = res.state
      if (onTransition && prevVars !== cur.variables) {
        onTransition(prevVars, cur.variables)
      }
      if (res.finished) {
        return { ok: true, state: cur, finished: true }
      }
      continue
    }

    const done =
      (!cur.branchQueue || cur.branchQueue.length === 0) && cur.stepIndex >= scene.steps.length
    return { ok: true, state: cur, finished: done || effective === null }
  }
  return { ok: false, error: '调试器结算超过最大步数上限(疑似死循环)', state: cur }
}

const advanceOneLogicalStep = (
  graph: VmGraph,
  state: VmState,
  onTransition?: (prevVars: Record<string, unknown>, nextVars: Record<string, unknown>) => void
): { ok: true; state: VmState; finished: boolean } | { ok: false; error: string; state: VmState } => {
  const settled = settleSilentSteps(graph, state, onTransition)
  if (!settled.ok || settled.finished) return settled

  const curStep = getCurrentStep(graph, settled.state)
  if (curStep === null) {
    return { ok: true, state: settled.state, finished: true }
  }

  if (curStep.type === 'goto') {
    const jumped = executeGotoStep(graph, settled.state, curStep)
    if (!jumped.ok) {
      return { ok: false, error: jumped.error, state: settled.state }
    }
    return settleSilentSteps(graph, jumped.state, onTransition)
  }

  const prevVars = settled.state.variables
  const res = advanceVm(graph, settled.state)
  if (!res.ok) {
    return { ok: false, error: res.error, state: settled.state }
  }
  if (onTransition && prevVars !== res.state.variables) {
    onTransition(prevVars, res.state.variables)
  }
  if (res.finished) {
    return { ok: true, state: res.state, finished: true }
  }
  return settleSilentSteps(graph, res.state, onTransition)
}

export interface VmDebugger {
  getBreakpoints: () => ReadonlySet<string>
  setBreakpoints: (next: Iterable<string>) => void
  addBreakpoint: (id: string) => void
  removeBreakpoint: (id: string) => void
  toggleBreakpoint: (id: string) => boolean
  hasBreakpoint: (id: string) => boolean
  getPausedAt: () => VmBreakpointHit | null
  clearPause: () => void
  getVariables: (state: VmState) => Record<string, unknown>
  watch: (callback: VmVariableWatchCallback) => () => void
  notifyVariablesIfChanged: (
    prevVars: Record<string, unknown>,
    nextVars: Record<string, unknown>
  ) => VmVariableChange[]
  /** 初始化/切换场景时结算前置静默步并检查起点是否直接命中断点 */
  enter: (graph: VmGraph, state: VmState) => VmDebugStepResult
  /** 单步推进:保持单步语义,落点命中断点时置 pausedAt */
  step: (graph: VmGraph, state: VmState) => VmDebugStepResult
  /** 续走:从当前位置(含断点暂停处)推进,跨过非断点步直至下一断点、选项或剧本结束 */
  continue: (graph: VmGraph, state: VmState) => VmDebugStepResult
}

export interface CreateVmDebuggerOptions {
  breakpoints?: Iterable<string>
}

export const createVmDebugger = (opts?: CreateVmDebuggerOptions): VmDebugger => {
  let breakpoints = new Set<string>(opts?.breakpoints ?? [])
  let pausedAt: VmBreakpointHit | null = null
  const watchers = new Set<VmVariableWatchCallback>()

  const notifyVariablesIfChanged = (
    prevVars: Record<string, unknown>,
    nextVars: Record<string, unknown>
  ): VmVariableChange[] => {
    const changes = diffVariables(prevVars, nextVars)
    if (changes.length > 0 && watchers.size > 0) {
      const snapshot = { ...nextVars }
      for (const cb of watchers) {
        cb(snapshot, changes)
      }
    }
    return changes
  }

  const enter = (graph: VmGraph, state: VmState): VmDebugStepResult => {
    pausedAt = null
    const settled = settleSilentSteps(graph, state, notifyVariablesIfChanged)
    if (!settled.ok) {
      return {
        ok: false,
        error: settled.error,
        state: settled.state,
        pausedAt: null,
        stopReason: 'error'
      }
    }
    if (settled.finished) {
      return {
        ok: true,
        state: settled.state,
        finished: true,
        pausedAt: null,
        stopReason: 'finished'
      }
    }
    const hit = matchBreakpoint(graph, settled.state, breakpoints)
    if (hit) {
      pausedAt = hit
      return {
        ok: true,
        state: settled.state,
        finished: false,
        pausedAt: hit,
        stopReason: 'breakpoint'
      }
    }
    const curStep = getCurrentStep(graph, settled.state)
    return {
      ok: true,
      state: settled.state,
      finished: false,
      pausedAt: null,
      stopReason: curStep?.type === 'choice' ? 'choice' : 'step'
    }
  }

  const step = (graph: VmGraph, state: VmState): VmDebugStepResult => {
    pausedAt = null
    const next = advanceOneLogicalStep(graph, state, notifyVariablesIfChanged)
    if (!next.ok) {
      return {
        ok: false,
        error: next.error,
        state: next.state,
        pausedAt: null,
        stopReason: 'error'
      }
    }
    if (next.finished) {
      return {
        ok: true,
        state: next.state,
        finished: true,
        pausedAt: null,
        stopReason: 'finished'
      }
    }
    const hit = matchBreakpoint(graph, next.state, breakpoints)
    if (hit) {
      pausedAt = hit
      return {
        ok: true,
        state: next.state,
        finished: false,
        pausedAt: hit,
        stopReason: 'breakpoint'
      }
    }
    const curStep = getCurrentStep(graph, next.state)
    return {
      ok: true,
      state: next.state,
      finished: false,
      pausedAt: null,
      stopReason: curStep?.type === 'choice' ? 'choice' : 'step'
    }
  }

  const continueRun = (graph: VmGraph, state: VmState): VmDebugStepResult => {
    const settledStart = settleSilentSteps(graph, state, notifyVariablesIfChanged)
    if (!settledStart.ok) {
      pausedAt = null
      return {
        ok: false,
        error: settledStart.error,
        state: settledStart.state,
        pausedAt: null,
        stopReason: 'error'
      }
    }
    if (settledStart.finished) {
      pausedAt = null
      return {
        ok: true,
        state: settledStart.state,
        finished: true,
        pausedAt: null,
        stopReason: 'finished'
      }
    }

    // 若尚未在当前断点暂停过,且起点本身就是断点 → 先在此断点暂停
    const initialHit = matchBreakpoint(graph, settledStart.state, breakpoints)
    const resumingFromSameBreakpoint =
      pausedAt !== null &&
      initialHit !== null &&
      pausedAt.markerId === initialHit.markerId &&
      pausedAt.sceneId === initialHit.sceneId &&
      pausedAt.stepIndex === initialHit.stepIndex

    if (initialHit && !resumingFromSameBreakpoint) {
      pausedAt = initialHit
      return {
        ok: true,
        state: settledStart.state,
        finished: false,
        pausedAt: initialHit,
        stopReason: 'breakpoint'
      }
    }

    pausedAt = null
    let cur = settledStart.state

    // 若起点是 choice 且未解决,无法自动推进,直接停在 choice 等待用户选择
    if (getCurrentStep(graph, cur)?.type === 'choice') {
      return {
        ok: true,
        state: cur,
        finished: false,
        pausedAt: null,
        stopReason: 'choice'
      }
    }

    for (let i = 0; i < MAX_DEBUG_CONTINUE_STEPS; i++) {
      const next = advanceOneLogicalStep(graph, cur, notifyVariablesIfChanged)
      if (!next.ok) {
        return {
          ok: false,
          error: next.error,
          state: next.state,
          pausedAt: null,
          stopReason: 'error'
        }
      }
      cur = next.state
      if (next.finished) {
        return {
          ok: true,
          state: cur,
          finished: true,
          pausedAt: null,
          stopReason: 'finished'
        }
      }
      const hit = matchBreakpoint(graph, cur, breakpoints)
      if (hit) {
        pausedAt = hit
        return {
          ok: true,
          state: cur,
          finished: false,
          pausedAt: hit,
          stopReason: 'breakpoint'
        }
      }
      if (getCurrentStep(graph, cur)?.type === 'choice') {
        return {
          ok: true,
          state: cur,
          finished: false,
          pausedAt: null,
          stopReason: 'choice'
        }
      }
    }

    return {
      ok: false,
      error: 'continue 超过最大步数上限(疑似无限跳转循环)',
      state: cur,
      pausedAt: null,
      stopReason: 'error'
    }
  }

  return {
    getBreakpoints: () => breakpoints,
    setBreakpoints: (next) => {
      breakpoints = new Set(next)
    },
    addBreakpoint: (id) => {
      breakpoints.add(id)
    },
    removeBreakpoint: (id) => {
      breakpoints.delete(id)
    },
    toggleBreakpoint: (id) => {
      if (breakpoints.has(id)) {
        breakpoints.delete(id)
        if (pausedAt?.markerId === id) pausedAt = null
        return false
      }
      breakpoints.add(id)
      return true
    },
    hasBreakpoint: (id) => breakpoints.has(id),
    getPausedAt: () => pausedAt,
    clearPause: () => {
      pausedAt = null
    },
    getVariables,
    watch: (callback) => {
      watchers.add(callback)
      return () => {
        watchers.delete(callback)
      }
    },
    notifyVariablesIfChanged,
    enter,
    step,
    continue: continueRun
  }
}
