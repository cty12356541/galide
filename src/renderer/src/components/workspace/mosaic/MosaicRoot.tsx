/**
 * MosaicRoot — 中区分栏的组件岛根(react-mosaic-component)
 *
 * 设计:
 *   - PR2 范围:仅 mosaic 化"中区"(script / flow / preview)
 *   - 三个 panel 可拖/可拆/可堆叠/可浮出
 *   - ToolWindow(left/ai)由 CenterSplit 单独 react-resizable-panels 包裹
 *   - 浮出:点 MosaicWindow 头部的 ⤴ 按钮 → addFloatingPanel(panelId)
 *   - 主进程收到 floating 通知后创建 BrowserWindow(走 workspace.openPanel IPC)
 *   - 用户关闭浮动窗口时,floating 状态回滚(后续 PR 补,目前 store-only)
 */
import { useEffect, useMemo } from 'react'
import {
  Mosaic,
  MosaicWindow,
  type MosaicNode
} from 'react-mosaic-component'
import 'react-mosaic-component/react-mosaic-component.css'
import { useUiStore, type WorkspaceMosaicNode } from '../../../lib/store'
import { ALL_PANEL_IDS, getPanelComponent, PANEL_META, type PanelId } from './panel-registry'

/** 默认布局:row → script | (column: flow / preview) */
export const DEFAULT_TREE: WorkspaceMosaicNode = {
  direction: 'row',
  first: 'script-editor',
  second: {
    direction: 'column',
    first: 'flow-view',
    second: 'preview-canvas'
  }
}

/**
 * 校验 mosaic 树,丢弃非法 panel id(防止持久化层脏数据)
 */
export const sanitizeTree = (node: WorkspaceMosaicNode | null | undefined): WorkspaceMosaicNode => {
  if (!node) return DEFAULT_TREE
  if (typeof node === 'string') {
    return ALL_PANEL_IDS.includes(node as PanelId) ? (node as WorkspaceMosaicNode) : 'script-editor'
  }
  return {
    direction: node.direction,
    first: sanitizeTree(node.first),
    second: sanitizeTree(node.second)
  }
}

export const MosaicRoot = (): JSX.Element => {
  const mosaicTree = useUiStore((s) => s.mosaicTree)
  const setMosaicTree = useUiStore((s) => s.setMosaicTree)
  const addFloatingPanel = useUiStore((s) => s.addFloatingPanel)
  const removeFloatingPanel = useUiStore((s) => s.removeFloatingPanel)

  // 启动期 / 缺省值兜底
  const tree: WorkspaceMosaicNode = useMemo(() => sanitizeTree(mosaicTree), [mosaicTree])

  useEffect(() => {
    if (!mosaicTree) setMosaicTree(DEFAULT_TREE)
  }, [mosaicTree, setMosaicTree])

  // 浮出 panel(简化为 store + IPC,真实 BrowserWindow 创建走 main 端)
  const handleFloat = (panelId: PanelId): void => {
    addFloatingPanel(panelId)
    // 通知 main 进程创建 BrowserWindow
    void window.galide.workspace.openPanel({ panelId }).catch(() => {
      // fallback: 失败时回滚 store
      removeFloatingPanel(panelId)
    })
  }

  return (
    <div className="h-full w-full" data-testid="mosaic-root">
      <Mosaic<PanelId>
        renderTile={(id, path) => (
          <MosaicWindow<PanelId>
            path={path}
            title={PANEL_META[id]?.title ?? id}
            renderToolbar={() => (
              <FloatButton
                panelId={id}
                onClick={() => handleFloat(id)}
              />
            )}
          >
            {renderPanel(id)}
          </MosaicWindow>
        )}
        value={tree as MosaicNode<PanelId>}
        onChange={(next) => setMosaicTree(sanitizeTree(next as WorkspaceMosaicNode))}
        className="mosaic-blueprint-theme bp5-dark"
      />
    </div>
  )
}

const renderPanel = (id: PanelId): JSX.Element => {
  const Comp = getPanelComponent(id)
  return <Comp />
}

const FloatButton = ({
  panelId,
  onClick
}: {
  panelId: PanelId
  onClick: () => void
}): JSX.Element => (
  <button
    type="button"
    onClick={onClick}
    title={`浮出 ${PANEL_META[panelId]?.title ?? panelId}`}
    aria-label={`浮出 ${PANEL_META[panelId]?.title ?? panelId}`}
    data-testid={`float-${panelId}`}
    className="px-2 py-1 text-xs rounded hover:bg-bg-elevated text-text-muted hover:text-text transition-colors"
  >
    ⤴ 浮出
  </button>
)

/** 收集所有叶子(用于工具栏 + floating 检查) */
export const getAllLeafIds = (node: WorkspaceMosaicNode): PanelId[] => {
  if (typeof node === 'string') return [node]
  return [...getAllLeafIds(node.first), ...getAllLeafIds(node.second)]
}
