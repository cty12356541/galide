/**
 * EditorCore — 编辑核心区布局(方案 B)
 *
 * 左一右二(右上下):主编辑面(卡片/源码 tabs) | (场景轨 / 剧情决策树)
 * 预览 PreviewCanvas 作为可折叠底栏;分栏比例读 store.editorCoreLayout(B2)。
 */
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Eye, EyeOff } from 'lucide-react'
import { SceneRail } from './SceneRail'
import { EditorSurfaceTabs } from './EditorSurfaceTabs'
import { FlowView } from '../../features/flow-view/FlowView'
import { PreviewCanvas } from '../../features/preview/PreviewCanvas'
import { useUiStore } from '../../lib/store'

const handleH = 'w-1.5 rounded-full bg-border hover:bg-accent transition-colors my-1'
const handleV = 'h-1.5 rounded-full bg-border hover:bg-accent transition-colors mx-1'

export const EditorCore = (): JSX.Element => {
  const previewOpen = useUiStore((s) => s.previewOpen)
  const setPreviewOpen = useUiStore((s) => s.setPreviewOpen)
  const layout = useUiStore((s) => s.editorCoreLayout)
  const workspacePreset = useUiStore((s) => s.workspacePreset)
  const setEditorCoreLayout = useUiStore((s) => s.setEditorCoreLayout)

  const patchCenterHorizontal = (sizes: number[]): void => {
    if (sizes.length < 2) return
    setEditorCoreLayout({ beat: sizes[0], right: sizes[1] })
  }

  const patchRightVertical = (sizes: number[]): void => {
    if (sizes.length < 2) return
    setEditorCoreLayout({ sceneRail: sizes[0], flow: sizes[1] })
  }

  const patchPreviewVertical = (sizes: number[]): void => {
    if (sizes.length < 2) return
    setEditorCoreLayout({ centerRow: sizes[0], preview: sizes[1] })
  }

  /** 左一右二核心行:主编辑面 | (场景轨 / 决策树 上下) */
  const CenterRow = (): JSX.Element => (
    <PanelGroup
      direction="horizontal"
      className="h-full"
      key={`ec-h-${workspacePreset}-${layout.beat}-${layout.right}`}
      onLayout={patchCenterHorizontal}
    >
      <Panel id="ec-beat-editor" order={1} defaultSize={layout.beat} minSize={40}>
        <EditorSurfaceTabs />
      </Panel>
      <PanelResizeHandle className={handleH} />
      <Panel id="ec-right" order={2} defaultSize={layout.right} minSize={20} maxSize={50}>
        <PanelGroup
          direction="vertical"
          className="h-full"
          key={`ec-v-${workspacePreset}-${layout.sceneRail}-${layout.flow}`}
          onLayout={patchRightVertical}
        >
          <Panel id="ec-scene-rail" order={1} defaultSize={layout.sceneRail} minSize={20} maxSize={70}>
            <SceneRail />
          </Panel>
          <PanelResizeHandle className={handleV} />
          <Panel id="ec-flow-view" order={2} defaultSize={layout.flow} minSize={20} maxSize={80}>
            <FlowView />
          </Panel>
        </PanelGroup>
      </Panel>
    </PanelGroup>
  )

  return (
    <div className="relative h-full w-full">
      {previewOpen ? (
        <PanelGroup
          direction="vertical"
          className="h-full"
          key={`ec-pv-${workspacePreset}-${layout.centerRow}-${layout.preview}`}
          onLayout={patchPreviewVertical}
        >
          <Panel id="ec-center-row" order={1} defaultSize={layout.centerRow} minSize={30}>
            <CenterRow />
          </Panel>
          <PanelResizeHandle className={handleV} />
          <Panel id="ec-preview" order={2} defaultSize={layout.preview} minSize={15} maxSize={70}>
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
