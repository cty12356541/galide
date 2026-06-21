/**
 * usePanelFloat — 浮出 panel 通用 hook(功能即岛 v2)
 *
 * 统一行为:addFloatingPanel + openPanel(创建独立 BrowserWindow)。
 *   - 主岛:主窗该侧槽由 CenterSplit 据浮出态隐藏
 *   - 子岛:父主岛 tab 标记浮出态
 *   - 编辑器大陆 doc:浮出独立窗渲染该组件(mosaic 引擎已移除,不再操纵树)
 *
 * 失败回滚:openPanel 返 ok:false 或 reject → removeFloatingPanel + error store
 */
import { useCallback } from 'react'
import { useUiStore, useErrorStore } from '../store'
import type {
  EditorDocId,
  ToolWindowId,
  SubIslandId
} from '../../components/workspace/mosaic/panel-registry'

type FloatableId = EditorDocId | ToolWindowId | SubIslandId

export const usePanelFloat = (): ((panelId: FloatableId) => void) => {
  return useCallback((panelId: FloatableId) => {
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
  }, [])
}
