/**
 * CenterSplit — 主区分栏(功能即岛 v2:三槽 + 编辑器大陆)
 *
 * 布局:
 *   - 左槽(visiblePerSide.left)| 编辑器大陆(mosaic)| 右槽(visiblePerSide.right)
 *   - 底部槽(visiblePerSide.bottom)横跨大陆下方
 *   - 槽内主岛若已浮出则该槽隐藏(避免双渲染)
 *   - 占位主岛(search/debug/settings)走 LeftToolWindow;真实主岛走 SideToolWindow
 *
 * 沿用 react-resizable-panels,泛化原 AI 的 right/bottom 分支为通用三槽。
 */
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useUiStore } from '../../lib/store'
import { LeftToolWindow } from './LeftToolWindow'
import { SideToolWindow } from './SideToolWindow'
import { MosaicRoot } from './mosaic/MosaicRoot'
import {
  isToolWindowId,
  isPlaceholderId,
  type ToolWindowId,
  type PlaceholderId
} from './mosaic/panel-registry'

const renderSlot = (content: ToolWindowId | PlaceholderId | null): JSX.Element | null => {
  if (content === null) return null
  if (isPlaceholderId(content)) return <LeftToolWindow placeholderId={content} />
  if (isToolWindowId(content)) return <SideToolWindow toolWindowId={content} />
  return null
}

export const CenterSplit = (): JSX.Element => {
  const visiblePerSide = useUiStore((s) => s.visiblePerSide)
  const floatingPanels = useUiStore((s) => s.floatingPanels)

  // 某侧可见内容若已浮出 → 该槽隐藏
  const leftContent = visiblePerSide.left
  const rightContent = visiblePerSide.right
  const bottomContent = visiblePerSide.bottom
  const leftFloating =
    leftContent !== null && isToolWindowId(leftContent) && floatingPanels.includes(leftContent)
  const rightFloating =
    rightContent !== null && isToolWindowId(rightContent) && floatingPanels.includes(rightContent)
  const bottomFloating =
    bottomContent !== null && isToolWindowId(bottomContent) && floatingPanels.includes(bottomContent)

  const showLeft = leftContent !== null && !leftFloating
  const showRight = rightContent !== null && !rightFloating
  const showBottom = bottomContent !== null && !bottomFloating

  // 中区行:左 | 大陆 | 右
  const CenterRow = (): JSX.Element => (
    <PanelGroup direction="horizontal" autoSaveId="galide-center-row" className="h-full gap-3">
      {showLeft ? (
        <>
          <Panel defaultSize={20} minSize={12} maxSize={40} collapsible order={1}>
            {renderSlot(leftContent)}
          </Panel>
          <PanelResizeHandle className="w-1.5 rounded-full bg-border hover:bg-accent transition-colors my-1" />
        </>
      ) : null}
      <Panel defaultSize={showLeft ? (showRight ? 60 : 80) : showRight ? 80 : 100} minSize={30} order={2}>
        <MosaicRoot />
      </Panel>
      {showRight ? (
        <>
          <PanelResizeHandle className="w-1.5 rounded-full bg-border hover:bg-accent transition-colors my-1" />
          <Panel defaultSize={22} minSize={15} maxSize={50} collapsible order={3}>
            {renderSlot(rightContent)}
          </Panel>
        </>
      ) : null}
    </PanelGroup>
  )

  // 有底部槽:垂直 [中区行 | 底部]
  if (showBottom) {
    return (
      <PanelGroup direction="vertical" autoSaveId="galide-center-bottom" className="flex-1 min-h-0 gap-3">
        <Panel defaultSize={70} minSize={30}>
          <CenterRow />
        </Panel>
        <PanelResizeHandle className="h-1.5 rounded-full bg-border hover:bg-accent transition-colors mx-1" />
        <Panel defaultSize={30} minSize={15} maxSize={60} collapsible>
          {renderSlot(bottomContent)}
        </Panel>
      </PanelGroup>
    )
  }

  return (
    <div className="flex-1 min-h-0">
      <CenterRow />
    </div>
  )
}
