/**
 * usePanelFloat — 浮出 panel 通用 hook(功能即岛 v2)
 *
 * 三分支:
 *   - EditorDoc(编辑器大陆):浮出时从 mosaic 树移除,避免主窗与浮出窗双渲染
 *   - ToolWindow(主岛):addFloatingPanel + openPanel;主窗该侧槽由 CenterSplit 据浮出态隐藏
 *   - SubIsland(子岛):addFloatingPanel + openPanel;父主岛 tab 标记浮出态
 *
 * 失败回滚:openPanel 返 ok:false 或 reject → removeFloatingPanel + error store
 */
import { useCallback } from 'react'
import { useUiStore, useErrorStore } from '../store'
import {
  isEditorDoc,
  type EditorDocId,
  type ToolWindowId,
  type SubIslandId
} from '../../components/workspace/mosaic/panel-registry'
import { sanitizeTree, DEFAULT_TREE } from '../../components/workspace/mosaic/MosaicRoot'
import type { WorkspaceMosaicNode } from '../store'

type FloatableId = EditorDocId | ToolWindowId | SubIslandId

/**
 * 把指定编辑器大陆 doc 从 mosaic 树中移除(浮出时)
 */
const removePanelFromTree = (
  tree: WorkspaceMosaicNode,
  panelId: EditorDocId
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

export const usePanelFloat = (): ((panelId: FloatableId) => void) => {
  return useCallback((panelId: FloatableId) => {
    useUiStore.getState().addFloatingPanel(panelId)

    // 编辑器大陆:从 mosaic 树移除
    if (isEditorDoc(panelId)) {
      const cur = useUiStore.getState().mosaicTree
      if (cur) {
        const next = removePanelFromTree(cur, panelId)
        if (next) {
          useUiStore.getState().setMosaicTree(sanitizeTree(next))
        } else {
          useUiStore.getState().setMosaicTree(DEFAULT_TREE)
        }
      }
    }
    // 主岛 / 子岛:不动 mosaic 树(CenterSplit 据 floatingPanels 隐藏槽位 / tab 标记浮出态)

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
