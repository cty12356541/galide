/**
 * useWorkspacePersistence — 工作区布局持久化(P5c)
 *
 * 与 EditorCore 的 react-resizable-panels autoSaveId(renderer localStorage)同源,
 * 把 dockSide / visiblePerSide / activeSubIsland 三组状态也入盘,重启后一致还原。
 *
 *   - 挂载时 hydrate(校验通过才覆盖默认值,坏数据静默丢弃)
 *   - 变更后防抖 300ms 写回
 *   - 浮出窗跳过(单面板窗口,且避免多窗竞争写)
 *
 * 不走 main 进程 IPC:复用 renderer localStorage,零 main/preload 改动,与 autoSaveId 一致。
 */
import { useEffect } from 'react'
import { useUiStore } from '../store'
import { isFloatingWindow } from '../../app/FloatingPanelHost'
import {
  isToolWindowId,
  isSubIslandId,
  type ToolWindowId,
  type SubIslandId,
  type DockSide,
  type SlotContent
} from '../../components/workspace/mosaic/panel-registry'

export const WORKSPACE_LAYOUT_KEY = 'galide.workspaceLayout.v1'
const TOOL_WINDOWS: readonly ToolWindowId[] = ['project', 'git', 'outline', 'character', 'ai']
const DOCK_SIDES: readonly DockSide[] = ['left', 'right', 'bottom']
const PLACEHOLDERS = new Set(['search', 'debug', 'settings'])

type VisiblePerSide = { left: SlotContent | null; right: SlotContent | null; bottom: SlotContent | null }

type Layout = {
  dockSide: Record<ToolWindowId, DockSide>
  visiblePerSide: VisiblePerSide
  activeSubIsland: Record<ToolWindowId, SubIslandId>
}

const isDockSide = (x: unknown): x is DockSide =>
  typeof x === 'string' && (DOCK_SIDES as readonly string[]).includes(x)

const isSubIslandValue = (x: unknown): x is SubIslandId =>
  typeof x === 'string' && isSubIslandId(x)

const isSlot = (x: unknown): boolean =>
  x === null || (typeof x === 'string' && (isToolWindowId(x) || PLACEHOLDERS.has(x)))

const validate = (raw: unknown): Layout | null => {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const { dockSide, visiblePerSide, activeSubIsland } = o
  if (!dockSide || typeof dockSide !== 'object') return null
  if (!visiblePerSide || typeof visiblePerSide !== 'object') return null
  if (!activeSubIsland || typeof activeSubIsland !== 'object') return null
  const ds = dockSide as Record<string, unknown>
  const vis = visiblePerSide as Record<string, unknown>
  const asi = activeSubIsland as Record<string, unknown>
  for (const tw of TOOL_WINDOWS) {
    if (!isDockSide(ds[tw])) return null
    if (!isSubIslandValue(asi[tw])) return null
  }
  for (const side of DOCK_SIDES) {
    if (!isSlot(vis[side])) return null
  }
  return {
    dockSide: ds as Record<ToolWindowId, DockSide>,
    visiblePerSide: vis as VisiblePerSide,
    activeSubIsland: asi as Record<ToolWindowId, SubIslandId>
  }
}

export const useWorkspacePersistence = (): void => {
  const floating = isFloatingWindow()
  const dockSide = useUiStore((s) => s.dockSide)
  const visiblePerSide = useUiStore((s) => s.visiblePerSide)
  const activeSubIsland = useUiStore((s) => s.activeSubIsland)

  // hydrate(mount 一次)
  useEffect(() => {
    if (floating) return
    try {
      const raw = window.localStorage.getItem(WORKSPACE_LAYOUT_KEY)
      if (!raw) return
      const layout = validate(JSON.parse(raw))
      if (!layout) return
      useUiStore.setState({
        dockSide: layout.dockSide,
        visiblePerSide: layout.visiblePerSide,
        activeSubIsland: layout.activeSubIsland
      })
    } catch {
      // 坏数据静默丢弃,沿用默认布局
    }
  }, [floating])

  // persist(防抖写回)
  useEffect(() => {
    if (floating) return
    const id = setTimeout(() => {
      try {
        window.localStorage.setItem(
          WORKSPACE_LAYOUT_KEY,
          JSON.stringify({ dockSide, visiblePerSide, activeSubIsland })
        )
      } catch {
        // 配额/隐私模式:忽略
      }
    }, 300)
    return () => clearTimeout(id)
  }, [floating, dockSide, visiblePerSide, activeSubIsland])
}
