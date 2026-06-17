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
import { usePanelFloat } from '../../../lib/hooks/use-panel-float'
import {
  Mosaic,
  MosaicWindow,
  type MosaicNode
} from 'react-mosaic-component'
import 'react-mosaic-component/react-mosaic-component.css'
import { useUiStore, type WorkspaceMosaicNode } from '../../../lib/store'
import { MOSAIC_PANEL_IDS, getPanelComponent, PANEL_META, type PanelId } from './panel-registry'

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

export type SanitizeResult = {
  tree: WorkspaceMosaicNode
  /** 是否有 panel id 被替换/丢弃(持久化层脏数据) */
  repaired: boolean
}

/**
 * 校验 mosaic 树,丢弃非法 panel id(防止持久化层脏数据)
 * 返回 { tree, repaired } — repaired=true 表示有替换,UI 可提示用户
 */
export const sanitizeTree = (
  node: WorkspaceMosaicNode | null | undefined
): WorkspaceMosaicNode => sanitizeTreeWithResult(node).tree

/**
 * 同上但带 repaired 标记(给持久化层用,触发 toast)
 */
export const sanitizeTreeWithResult = (
  node: WorkspaceMosaicNode | null | undefined
): SanitizeResult => {
  if (!node) return { tree: DEFAULT_TREE, repaired: false }
  if (typeof node === 'string') {
    if (MOSAIC_PANEL_IDS.includes(node as PanelId)) {
      return { tree: node, repaired: false }
    }
    return { tree: 'script-editor', repaired: true }
  }
  const first = sanitizeTreeWithResult(node.first)
  const second = sanitizeTreeWithResult(node.second)
  return {
    tree: { direction: node.direction, first: first.tree, second: second.tree },
    repaired: first.repaired || second.repaired
  }
}

export const MosaicRoot = (): JSX.Element => {
  const mosaicTree = useUiStore((s) => s.mosaicTree)
  const setMosaicTree = useUiStore((s) => s.setMosaicTree)

  // 启动期 / 缺省值兜底
  const tree: WorkspaceMosaicNode = useMemo(() => sanitizeTree(mosaicTree), [mosaicTree])

  useEffect(() => {
    if (!mosaicTree) setMosaicTree(DEFAULT_TREE)
  }, [mosaicTree, setMosaicTree])

  // 浮出 panel(用共享 hook,统一失败处理)
  const float = usePanelFloat()

  return (
    <div className="h-full w-full" data-testid="mosaic-root">
      <Mosaic<PanelId>
        renderTile={(id, path) => (
          <MosaicWindow<PanelId>
            path={path}
            title={PANEL_META[id]?.title ?? id}
            renderToolbar={() => (
              // 必须是原生 DOM 元素(react-mosaic 内部用 react-dnd 包 toolbar,
              // 需要 ref attach 到原生 element)— 抽出 FloatButton 组件会触发
              // "Only native element nodes can now be passed to React DnD connectors"
              <button
                type="button"
                onClick={() => float(id)}
                title={`浮出 ${PANEL_META[id]?.title ?? id}`}
                aria-label={`浮出 ${PANEL_META[id]?.title ?? id}`}
                data-testid={`float-${id}`}
                className="px-2 py-1 text-xs rounded hover:bg-bg-elevated text-text-muted hover:text-text transition-colors"
              >
                ⤴ 浮出
              </button>
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

/** 收集所有叶子(用于工具栏 + floating 检查) */
export const getAllLeafIds = (node: WorkspaceMosaicNode): PanelId[] => {
  if (typeof node === 'string') return [node]
  return [...getAllLeafIds(node.first), ...getAllLeafIds(node.second)]
}
