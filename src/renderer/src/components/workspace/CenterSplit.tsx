/**
 * CenterSplit — 主区分栏(react-resizable-panels + react-mosaic)
 *
 * PR2 重构(2026-06-17):
 *   - 外层仍是 react-resizable-panels 三段(left | center | right)— 适配 ToolWindow 概念
 *   - 中区槽位从 "CenterTabs + ActiveView" 改成 "MosaicRoot"
 *   - 用户可在 mosaic 内拖拽组合 script / flow / preview,自由度高
 *   - AI 在 bottom 时:外层 PanelGroup 改 vertical
 *
 * PR1 行为保持:
 *   - 左侧 slot(LeftToolWindow)— 可关(react-resizable-panels collapsible)
 *   - 右侧 AI tool window(aiDockedLocation === 'right' 时)— 可关
 *   - 底部 AI tool window(aiDockedLocation === 'bottom' 时)— 可关
 *   - aiDockedLocation === 'left' / 'floating' 时 AI 不在主区(暂未实现 floating 接管)
 */
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useUiStore } from '../../lib/store'
import { LeftToolWindow } from './LeftToolWindow'
import { AiToolWindow } from './AiToolWindow'
import { MosaicRoot } from './mosaic/MosaicRoot'

export const CenterSplit = (): JSX.Element => {
  const leftPanelOpen = useUiStore((s) => s.leftPanelOpen)
  const aiPanelOpen = useUiStore((s) => s.aiPanelOpen)
  const aiDockedLocation = useUiStore((s) => s.aiDockedLocation)

  // AI 在底部:上下分栏(center 上 / ai 下)
  if (aiPanelOpen && aiDockedLocation === 'bottom') {
    return (
      <PanelGroup direction="vertical" autoSaveId="galide-center-bottom" className="flex-1 min-h-0">
        <Panel defaultSize={70} minSize={30}>
          <CenterWithLeft leftOpen={leftPanelOpen} />
        </Panel>
        <PanelResizeHandle className="h-1 bg-border hover:bg-accent transition-colors" />
        <Panel defaultSize={30} minSize={15} maxSize={60}>
          <AiToolWindow />
        </Panel>
      </PanelGroup>
    )
  }

  // AI 在右侧(默认):左右分栏(left | center | right)
  return (
    <PanelGroup direction="horizontal" autoSaveId="galide-center-right" className="flex-1 min-h-0">
      {leftPanelOpen ? (
        <>
          <Panel defaultSize={20} minSize={12} maxSize={40} collapsible>
            <div className="h-full border-r border-border overflow-hidden">
              <LeftToolWindow />
            </div>
          </Panel>
          <PanelResizeHandle className="w-1 bg-border hover:bg-accent transition-colors" />
        </>
      ) : null}
      <Panel defaultSize={aiPanelOpen ? 50 : 100} minSize={30}>
        <div className="h-full w-full overflow-hidden">
          <MosaicRoot />
        </div>
      </Panel>
      {aiPanelOpen ? (
        <>
          <PanelResizeHandle className="w-1 bg-border hover:bg-accent transition-colors" />
          <Panel defaultSize={30} minSize={15} maxSize={60} collapsible>
            <AiToolWindow />
          </Panel>
        </>
      ) : null}
    </PanelGroup>
  )
}

/**
 * CenterWithLeft — 当 AI 在底部时,center 区域本身可拆左/中
 * (用嵌套 PanelGroup 实现 left | center)
 */
const CenterWithLeft = ({ leftOpen }: { leftOpen: boolean }): JSX.Element => {
  if (!leftOpen) return <MosaicRoot />
  return (
    <PanelGroup direction="horizontal" autoSaveId="galide-center-bottom-left" className="h-full">
      <Panel defaultSize={20} minSize={12} maxSize={40} collapsible>
        <div className="h-full border-r border-border overflow-hidden">
          <LeftToolWindow />
        </div>
      </Panel>
      <PanelResizeHandle className="w-1 bg-border hover:bg-accent transition-colors" />
      <Panel defaultSize={80} minSize={30}>
        <div className="h-full w-full overflow-hidden">
          <MosaicRoot />
        </div>
      </Panel>
    </PanelGroup>
  )
}
