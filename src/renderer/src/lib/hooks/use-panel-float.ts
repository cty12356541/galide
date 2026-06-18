/**
 * usePanelFloat — 浮出 panel 通用 hook
 *
 * 封装 addFloatingPanel + openPanel + 失败回滚逻辑
 * 区分 ok:false(resolve 但返错)和 reject(promise throw)两种失败
 */
import { useCallback } from 'react'
import { useUiStore, useErrorStore } from '../store'
import {
  isToolWindow,
  isSidePanel,
  SIDE_PANEL_IDS,
  type PanelId
} from '../../components/workspace/mosaic/panel-registry'
import { sanitizeTree, DEFAULT_TREE } from '../../components/workspace/mosaic/MosaicRoot'
import type { WorkspaceMosaicNode, ActivitySelection } from '../store'


/**
 * 把指定 panel 从 mosaic 树中移除(浮出时)
 * - 如果 panel 不在树中(原本就不在),不动
 * - 如果整树只剩这一个 panel(变成单 leaf),保留它(不破坏树结构)
 * - 如果 panel 是某个分支的 leaf,删 leaf 后该分支收缩为另一个子树
 * - 如果 panel 是嵌套的某个内部节点(理论上不会发生),保留不动
 */
const removePanelFromTree = (
  tree: WorkspaceMosaicNode,
  panelId: PanelId
): WorkspaceMosaicNode | null => {
  if (typeof tree === 'string') {
    return tree === panelId ? null : tree
  }
  const first = removePanelFromTree(tree.first, panelId)
  const second = removePanelFromTree(tree.second, panelId)
  if (first === null && second === null) return null
  if (first === null) return second
  if (second === null) return first
  return { direction: tree.direction, first, second }
}

export const usePanelFloat = (): ((panelId: PanelId) => void) => {
  return useCallback((panelId: PanelId) => {
    useUiStore.getState().addFloatingPanel(panelId)

    // 中区 panel:从 mosaic 树移除,避免主窗口和浮出窗口双渲染
    if (!isToolWindow(panelId)) {
      const cur = useUiStore.getState().mosaicTree
      if (cur) {
        const next = removePanelFromTree(cur, panelId)
        if (next) {
          useUiStore.getState().setMosaicTree(sanitizeTree(next))
        } else {
          // 树被掏空(用户把所有 panel 都浮出了),重置为默认
          useUiStore.getState().setMosaicTree(DEFAULT_TREE)
        }
      }
    }

    // 侧边岛浮出:左槽切到下一个未浮出的侧边岛,全浮出则收起左槽
    if (isSidePanel(panelId)) {
      const st = useUiStore.getState()
      const visible = SIDE_PANEL_IDS.find(
        (id) => id !== panelId && !st.floatingPanels.includes(id)
      )
      if (visible) {
        st.setActiveSidePanel(visible)
        st.setActivitySelection(visible as ActivitySelection)
      } else {
        // 所有侧边岛都浮出了,收起左槽
        st.toggleLeftPanel()
      }
    }

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
