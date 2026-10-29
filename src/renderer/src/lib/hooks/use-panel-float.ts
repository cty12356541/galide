/**
 * usePanelFloat — 浮出 panel 通用 hook(功能即岛 v3)
 *
 * 统一行为:校验 MAX_FLOATING_PANELS 上限 → addFloatingPanel → openPanel(创建独立 BrowserWindow)。
 *   - 主岛:主窗该侧槽由 CenterSplit 据浮出态隐藏
 *   - 子岛:父主岛 tab 标记浮出态
 *   - 编辑器大陆 doc:浮出独立窗渲染该组件
 *
 * 失败回滚:超上限或 openPanel 返 ok:false / reject → removeFloatingPanel + error store
 */
import { useCallback } from 'react'
import { useUiStore, useErrorStore } from '../store'
import {
  MAX_FLOATING_PANELS,
  type EditorDocId,
  type ToolWindowId,
  type SubIslandId
} from '../../components/workspace/panels/panel-registry'

export type FloatableId = EditorDocId | ToolWindowId | SubIslandId

export const floatPanelWithGuard = (panelId: FloatableId): boolean => {
  const current = useUiStore.getState().floatingPanels
  if (current.includes(panelId)) return false
  if (current.length >= MAX_FLOATING_PANELS) {
    useErrorStore.getState().push({
      code: 'PANEL_FLOAT_LIMIT',
      source: panelId,
      message: `已到达最大浮出数 ${MAX_FLOATING_PANELS},请先关闭部分浮出窗口`
    })
    return false
  }

  useUiStore.getState().addFloatingPanel(panelId)

  void window.galide.workspace
    .openPanel({ panelId })
    .then((r) => {
      if (r.ok === false) {
        useUiStore.getState().removeFloatingPanel(panelId)
        useErrorStore.getState().push({
          code: 'PANEL_FLOAT_FAILED',
          source: panelId,
          message: `浮出失败: ${r.error}`
        })
      }
    })
    .catch((err: unknown) => {
      useUiStore.getState().removeFloatingPanel(panelId)
      useErrorStore.getState().push({
        code: 'PANEL_FLOAT_FAILED',
        source: panelId,
        message: `浮出失败: ${err instanceof Error ? err.message : String(err)}`
      })
    })
  return true
}

export const usePanelFloat = (): ((panelId: FloatableId) => void) => {
  return useCallback((panelId: FloatableId) => {
    floatPanelWithGuard(panelId)
  }, [])
}
