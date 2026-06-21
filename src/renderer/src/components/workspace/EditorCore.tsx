/**
 * EditorCore — 编辑核心区布局(方案 B)
 *
 * 左一右二(右上下):对话卡片 | (场景轨 / 剧情决策树)
 *   - 左:BeatCardEditor 对话卡片(主写作区,占大)
 *   - 右上:SceneRail 场景轨(索引枢纽)
 *   - 右下:FlowView 剧情决策树(结构图)
 * 对话卡(左主区)占大头;场景轨与决策树(右列)初始偏小。
 * 三者共享 store.scriptAst 单一真相源 + selectedSceneId 协同选中。
 *
 * 预览 PreviewCanvas 作为可折叠底栏(默认收起);各视图仍可浮出独立窗。
 * 用 react-resizable-panels(与 CenterSplit 同栈),动态 Panel 带 stable id + order。
 */
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Eye, EyeOff } from 'lucide-react'
import { SceneRail } from './SceneRail'
import { BeatCardEditor } from '../../features/beat-editor/BeatCardEditor'
import { FlowView } from '../../features/flow-view/FlowView'
import { PreviewCanvas } from '../../features/preview/PreviewCanvas'
import { useUiStore } from '../../lib/store'

const handleH = 'w-1.5 rounded-full bg-border hover:bg-accent transition-colors my-1'
const handleV = 'h-1.5 rounded-full bg-border hover:bg-accent transition-colors mx-1'

export const EditorCore = (): JSX.Element => {
  const previewOpen = useUiStore((s) => s.previewOpen)
  const setPreviewOpen = useUiStore((s) => s.setPreviewOpen)

  /** 左一右二核心行:对话卡 | (场景轨 / 决策树 上下) */
  const CenterRow = (): JSX.Element => (
    <PanelGroup direction="horizontal" className="h-full">
      <Panel id="ec-beat-editor" order={1} defaultSize={68} minSize={40}>
        <BeatCardEditor />
      </Panel>
      <PanelResizeHandle className={handleH} />
      <Panel id="ec-right" order={2} defaultSize={32} minSize={20} maxSize={50}>
        <PanelGroup direction="vertical" className="h-full">
          <Panel id="ec-scene-rail" order={1} defaultSize={40} minSize={20} maxSize={70}>
            <SceneRail />
          </Panel>
          <PanelResizeHandle className={handleV} />
          <Panel id="ec-flow-view" order={2} defaultSize={60} minSize={20} maxSize={80}>
            <FlowView />
          </Panel>
        </PanelGroup>
      </Panel>
    </PanelGroup>
  )

  return (
    <div className="relative h-full w-full">
      {previewOpen ? (
        <PanelGroup direction="vertical" className="h-full">
          <Panel id="ec-center-row" order={1} defaultSize={68} minSize={30}>
            <CenterRow />
          </Panel>
          <PanelResizeHandle className={handleV} />
          <Panel id="ec-preview" order={2} defaultSize={32} minSize={15} maxSize={70}>
            <PreviewCanvas />
          </Panel>
        </PanelGroup>
      ) : (
        <CenterRow />
      )}
      <button
        type="button"
        onClick={() => setPreviewOpen()}
        title={previewOpen ? '收起预览' : '展开预览'}
        aria-label={previewOpen ? '收起预览' : '展开预览'}
        data-testid="ec-preview-toggle"
        className="absolute bottom-2 right-2 z-10 h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-[12px] bg-surface border border-border text-text-muted hover:text-text hover:bg-bg-elevated shadow-sm transition-colors"
      >
        {previewOpen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        预览
      </button>
    </div>
  )
}
