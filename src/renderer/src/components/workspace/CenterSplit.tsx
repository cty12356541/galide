/**
 * CenterSplit — 主区分栏(react-resizable-panels + react-mosaic)
 *
 * PR3-A 重构(2026-06-17):
 *   - ToolWindow(left/ai)浮出时主窗口相应槽位隐藏(避免双渲染)
 *   - 浮出状态由 useUiStore.floatingPanels 数组决定
 *   - 否则保持 PR1/PR2 行为
 *
 * 行为:
 *   - leftPanelOpen=true && !floating.includes('left-tool-window') → 渲染左槽
 *   - aiPanelOpen=true && !floating.includes('ai-tool-window') → 渲染右槽
 *   - AI 在 bottom 时:外层 PanelGroup 改 vertical
 *   - aiDockedLocation === 'floating' 时,AI 仅当 floating 数组含它时走独立窗口
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
  const floatingPanels = useUiStore((s) => s.floatingPanels)

  const leftFloating = floatingPanels.includes('left-tool-window')
  const aiFloating = floatingPanels.includes('ai-tool-window')
  // 实际主窗口要不要渲染该槽位 = 开关 + 没被浮出
  const showLeft = leftPanelOpen && !leftFloating
  const showAi = aiPanelOpen && !aiFloating

  // AI 在底部:上下分栏(center 上 / ai 下)
  if (showAi && aiDockedLocation === 'bottom') {
    return (
      <PanelGroup direction="vertical" autoSaveId="galide-center-bottom" className="flex-1 min-h-0 gap-2">
        <Panel defaultSize={70} minSize={30}>
          <CenterWithLeft leftOpen={showLeft} />
        </Panel>
        <PanelResizeHandle className="h-1.5 rounded-full bg-border hover:bg-accent transition-colors mx-1" />
        <Panel defaultSize={30} minSize={15} maxSize={60}>
          <AiToolWindow />
        </Panel>
      </PanelGroup>
    )
  }

  // AI 在右侧(默认):左右分栏(left | center | right)
  return (
    <PanelGroup direction="horizontal" autoSaveId="galide-center-right" className="flex-1 min-h-0 gap-2">
      {showLeft ? (
        <>
          <Panel defaultSize={20} minSize={12} maxSize={40} collapsible>
            <div className="h-full w-full rounded-xl border border-border overflow-hidden bg-surface shadow-[var(--shadow-panel)]">
              <LeftToolWindow />
            </div>
          </Panel>
          <PanelResizeHandle className="w-1.5 rounded-full bg-border hover:bg-accent transition-colors my-1" />
        </>
      ) : null}
      <Panel defaultSize={showAi ? 50 : 100} minSize={30}>
        <div className="h-full w-full rounded-xl border border-border overflow-hidden bg-surface shadow-[var(--shadow-panel)]">
          <MosaicRoot />
        </div>
      </Panel>
      {showAi ? (
        <>
          <PanelResizeHandle className="w-1.5 rounded-full bg-border hover:bg-accent transition-colors my-1" />
          <Panel defaultSize={30} minSize={15} maxSize={60} collapsible>
            <div className="h-full w-full rounded-xl border border-border overflow-hidden bg-surface shadow-[var(--shadow-panel)]">
              <AiToolWindow />
            </div>
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
    <PanelGroup direction="horizontal" autoSaveId="galide-center-bottom-left" className="h-full gap-2">
      <Panel defaultSize={20} minSize={12} maxSize={40} collapsible>
        <div className="h-full w-full rounded-xl border border-border overflow-hidden bg-surface shadow-[var(--shadow-panel)]">
          <LeftToolWindow />
        </div>
      </Panel>
      <PanelResizeHandle className="w-1.5 rounded-full bg-border hover:bg-accent transition-colors my-1" />
      <Panel defaultSize={80} minSize={30}>
        <div className="h-full w-full rounded-xl border border-border overflow-hidden bg-surface shadow-[var(--shadow-panel)]">
          <MosaicRoot />
        </div>
      </Panel>
    </PanelGroup>
  )
}
