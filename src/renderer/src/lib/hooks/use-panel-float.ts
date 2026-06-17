/**
 * usePanelFloat — 浮出 panel 通用 hook
 *
 * 封装 addFloatingPanel + openPanel + 失败回滚逻辑
 * 区分 ok:false(resolve 但返错)和 reject(promise throw)两种失败
 */
import { useCallback } from 'react'
import { useUiStore, useErrorStore } from '../store'
import type { PanelId } from '../../components/workspace/mosaic/panel-registry'

export const usePanelFloat = (): ((panelId: PanelId) => void) => {
  return useCallback((panelId: PanelId) => {
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
