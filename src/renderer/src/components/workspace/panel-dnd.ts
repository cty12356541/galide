/**
 * panel-dnd — 原生 HTML5 DnD 面板停靠与边界守卫(Phase 3 T3-1 + T3-2)
 *
 * 单一事实源约束:
 * - migrateToolWindowLocation 为 DockedLocationMenu 与拖拽 drop 的唯一共享迁移入口,
 *   直接调用 workspaceStore(useUiStore) 的 setDockSide + showToolWindow 或浮出函数,不另造状态语义。
 * - evaluatePanelDrop 统一判定合法/非法投放(含文档大陆↔工具槽双向禁止与 MAX_FLOATING_PANELS 上限)。
 */
import { createStore, useStore } from 'zustand'
import { useUiStore } from '../../lib/store'
import {
  FLOATABLE_IDS,
  MAX_FLOATING_PANELS,
  isEditorDoc,
  isFloatableSubIsland,
  isToolWindowId,
  type DockSide,
  type ToolWindowId
} from './panels/panel-registry'
import type { FloatableId } from '../../lib/hooks/use-panel-float'

export const PANEL_DND_MIME = 'application/x-galide-panel'

export type DropZoneId = DockSide | 'floating' | 'editor-core'

export type PanelDropEvaluation =
  | { allowed: true; kind: 'dock'; side: DockSide; toolWindowId: ToolWindowId }
  | { allowed: true; kind: 'float'; panelId: FloatableId }
  | { allowed: false; reason: string }

export interface RejectedDropFeedback {
  zone: DropZoneId
  panelId: string | null
  reason: string
}

export interface PanelDndState {
  draggingPanelId: string | null
  hoveredZone: DropZoneId | null
  rejectedFeedback: RejectedDropFeedback | null
  startDrag: (panelId: string) => void
  endDrag: () => void
  setHoveredZone: (zone: DropZoneId | null) => void
  setRejectedFeedback: (feedback: RejectedDropFeedback | null) => void
}

export const panelDndStore = createStore<PanelDndState>((set) => ({
  draggingPanelId: null,
  hoveredZone: null,
  rejectedFeedback: null,
  startDrag: (panelId) =>
    set({
      draggingPanelId: panelId,
      hoveredZone: null,
      rejectedFeedback: null
    }),
  endDrag: () =>
    set({
      draggingPanelId: null,
      hoveredZone: null
    }),
  setHoveredZone: (zone) => set({ hoveredZone: zone }),
  setRejectedFeedback: (feedback) => set({ rejectedFeedback: feedback })
}))

export const usePanelDndStore: {
  (): PanelDndState
  <U>(selector: (state: PanelDndState) => U): U
  getState: typeof panelDndStore.getState
  setState: typeof panelDndStore.setState
  subscribe: typeof panelDndStore.subscribe
} = Object.assign(
  <U>(selector?: (state: PanelDndState) => U) =>
    useStore(panelDndStore, selector ?? ((s) => s as unknown as U)),
  {
    getState: panelDndStore.getState.bind(panelDndStore),
    setState: panelDndStore.setState.bind(panelDndStore),
    subscribe: panelDndStore.subscribe.bind(panelDndStore)
  }
)

export const writePanelDragData = (
  dataTransfer: DataTransfer | null | undefined,
  panelId: string
): void => {
  if (!dataTransfer) return
  try {
    dataTransfer.setData(PANEL_DND_MIME, panelId)
    dataTransfer.setData('text/plain', panelId)
    dataTransfer.effectAllowed = 'move'
  } catch {
    // 某些合成测试事件未完整实现 DataTransfer:由 store draggingPanelId 兜底
  }
}

export const setDropEffect = (
  dataTransfer: DataTransfer | null | undefined,
  effect: DataTransfer['dropEffect']
): void => {
  if (!dataTransfer) return
  try {
    dataTransfer.dropEffect = effect
  } catch {
    // 兼容只读合成 DataTransfer
  }
}

export const readDraggedPanelId = (
  dataTransfer: DataTransfer | null | undefined,
  fallbackId?: string | null
): string | null => {
  if (dataTransfer) {
    try {
      const fromCustom = dataTransfer.getData(PANEL_DND_MIME)
      if (fromCustom) return fromCustom
    } catch {
      // ignore
    }
  }
  return fallbackId ?? panelDndStore.getState().draggingPanelId
}

/**
 * 纯函数:校验拖拽面板投放到目标区域是否合法
 */
export const evaluatePanelDrop = (
  draggedId: string | null,
  zone: DropZoneId,
  floatingPanels: readonly string[]
): PanelDropEvaluation => {
  if (!draggedId) {
    return { allowed: false, reason: '未识别的拖拽面板' }
  }

  if (zone === 'editor-core') {
    if (isToolWindowId(draggedId) || isFloatableSubIsland(draggedId)) {
      return { allowed: false, reason: '工具窗不能停靠至编辑器核心区' }
    }
    if (isEditorDoc(draggedId)) {
      return { allowed: false, reason: '编辑器文档已在核心区中' }
    }
    return { allowed: false, reason: '非法面板类型' }
  }

  if (zone === 'floating') {
    if (!FLOATABLE_IDS.includes(draggedId)) {
      return { allowed: false, reason: '该面板不支持独立浮出' }
    }
    if (floatingPanels.includes(draggedId)) {
      return { allowed: false, reason: '该面板已处于浮出状态' }
    }
    if (floatingPanels.length >= MAX_FLOATING_PANELS) {
      return {
        allowed: false,
        reason: `已达最大浮出上限(${MAX_FLOATING_PANELS})`
      }
    }
    return { allowed: true, kind: 'float', panelId: draggedId as FloatableId }
  }

  // zone === 'left' | 'right' | 'bottom'
  if (isEditorDoc(draggedId)) {
    return { allowed: false, reason: '编辑器文档面板不能停靠到工具栏槽位' }
  }
  if (!isToolWindowId(draggedId)) {
    return { allowed: false, reason: '仅主工具窗支持停靠槽位迁移' }
  }
  return { allowed: true, kind: 'dock', side: zone, toolWindowId: draggedId }
}

/**
 * 与 DockedLocationMenu 共用的单一迁移语义函数
 */
export const migrateToolWindowLocation = (
  toolWindowId: ToolWindowId,
  target: DockSide | 'floating',
  floatFn: (panelId: FloatableId) => void
): void => {
  if (target === 'floating') {
    floatFn(toolWindowId)
    return
  }
  const st = useUiStore.getState()
  st.setDockSide(toolWindowId, target)
  st.showToolWindow(toolWindowId)
}

let rejectTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 执行 drop:合法则调用共享迁移函数;非法则拒绝写入并记录视觉拒绝反馈。
 */
export const executePanelDrop = (
  draggedId: string | null,
  zone: DropZoneId,
  floatFn: (panelId: FloatableId) => void
): PanelDropEvaluation => {
  const floatingPanels = useUiStore.getState().floatingPanels
  const evaluation = evaluatePanelDrop(draggedId, zone, floatingPanels)
  const dnd = panelDndStore.getState()
  dnd.endDrag()

  if (!evaluation.allowed) {
    dnd.setRejectedFeedback({ zone, panelId: draggedId, reason: evaluation.reason })
    if (rejectTimer) clearTimeout(rejectTimer)
    rejectTimer = setTimeout(() => {
      panelDndStore.getState().setRejectedFeedback(null)
    }, 1800)
    return evaluation
  }

  dnd.setRejectedFeedback(null)
  if (evaluation.kind === 'dock') {
    migrateToolWindowLocation(evaluation.toolWindowId, evaluation.side, floatFn)
  } else {
    floatFn(evaluation.panelId)
  }
  return evaluation
}
