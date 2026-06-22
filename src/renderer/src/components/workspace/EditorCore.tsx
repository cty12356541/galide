/**
 * EditorCore — 编辑核心区布局(品字形)
 *
 * 四格:左列贯通(卡片/源码) | 右上场景轨 | 右上流程 | 右下预览(可折叠)。
 * 左列纵向连通;右列上二下一,比例读 store.editorCoreLayout。
 */
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Eye, EyeOff } from 'lucide-react'
import { SceneRail } from './SceneRail'
import { EditorSurfaceTabs } from './EditorSurfaceTabs'
import { FlowView } from '../../features/flow-view/FlowView'
import { PreviewCanvas } from '../../features/preview/PreviewCanvas'
import { useUiStore } from '../../lib/store'
import { patchEditorCoreLayout } from './editor-core-layout'

const handleH = 'w-1.5 rounded-full bg-border hover:bg-accent transition-colors my-1'
const handleV = 'h-1.5 rounded-full bg-border hover:bg-accent transition-colors mx-1'

/** 面板 onLayout 会频繁回调;仅在尺寸实际变化时写 store,避免 remount 死循环 */
export const EditorCore = (): JSX.Element => {
  const previewOpen = useUiStore((s) => s.previewOpen)
  const setPreviewOpen = useUiStore((s) => s.setPreviewOpen)
  const layout = useUiStore((s) => s.editorCoreLayout)
  const workspacePreset = useUiStore((s) => s.workspacePreset)
  const setEditorCoreLayout = useUiStore((s) => s.setEditorCoreLayout)

  const patchCenterHorizontal = (sizes: number[]): void => {
    const cur = useUiStore.getState().editorCoreLayout
    const patch = patchEditorCoreLayout(['beat', 'right'], sizes, cur)
    if (patch) setEditorCoreLayout(patch)
  }

  const patchRightStackVertical = (sizes: number[]): void => {
    const cur = useUiStore.getState().editorCoreLayout
    const patch = patchEditorCoreLayout(['sceneRail', 'flow'], sizes, cur)
    if (patch) setEditorCoreLayout(patch)
  }

  const patchTopRightHorizontal = (sizes: number[]): void => {
    const cur = useUiStore.getState().editorCoreLayout
    const patch = patchEditorCoreLayout(['sceneRail', 'flow'], sizes, cur)
    if (patch) setEditorCoreLayout(patch)
  }

  const patchRightVertical = (sizes: number[]): void => {
    const cur = useUiStore.getState().editorCoreLayout
    const patch = patchEditorCoreLayout(['centerRow', 'preview'], sizes, cur)
    if (patch) setEditorCoreLayout(patch)
  }

  /** 品字顶行:场景轨 | 决策树(左右并列) */
  const TopBand = (): JSX.Element => (
    <PanelGroup
      direction="horizontal"
      className="h-full"
      key={`ec-tr-${workspacePreset}-${previewOpen ? 'pv' : 'np'}`}
      onLayout={patchTopRightHorizontal}
    >
      <Panel id="ec-scene-rail" order={1} defaultSize={layout.sceneRail} minSize={15} maxSize={70}>
        <SceneRail />
      </Panel>
      <PanelResizeHandle className={handleH} />
      <Panel id="ec-flow-view" order={2} defaultSize={layout.flow} minSize={15} maxSize={85}>
        <FlowView />
      </Panel>
    </PanelGroup>
  )

  /** 预览关:左一右二 — 右列场景轨 / 流程上下叠 */
  const RightStack = (): JSX.Element => (
    <PanelGroup
      direction="vertical"
      className="h-full"
      key={`ec-rs-${workspacePreset}`}
      onLayout={patchRightStackVertical}
    >
      <Panel id="ec-scene-rail" order={1} defaultSize={layout.sceneRail} minSize={18} maxSize={70}>
        <SceneRail />
      </Panel>
      <PanelResizeHandle className={handleV} />
      <Panel id="ec-flow-view" order={2} defaultSize={layout.flow} minSize={18} maxSize={82}>
        <FlowView />
      </Panel>
    </PanelGroup>
  )

  /** 预览开:品字 — 顶行场景|流程,底格预览(左列编辑器贯通) */
  const RightColumn = (): JSX.Element => {
    if (!previewOpen) {
      return <RightStack />
    }
    return (
      <PanelGroup
        direction="vertical"
        className="h-full"
        key={`ec-rv-${workspacePreset}`}
        onLayout={patchRightVertical}
      >
        <Panel id="ec-top-band" order={1} defaultSize={layout.centerRow} minSize={22}>
          <TopBand />
        </Panel>
        <PanelResizeHandle className={handleV} />
        <Panel id="ec-preview" order={2} defaultSize={layout.preview} minSize={18} maxSize={65}>
          <PreviewCanvas />
        </Panel>
      </PanelGroup>
    )
  }

  return (
    <div className="relative h-full w-full">
      <PanelGroup
        direction="horizontal"
        className="h-full"
        key={`ec-h-${workspacePreset}-${previewOpen ? 'pv' : 'np'}`}
        onLayout={patchCenterHorizontal}
      >
        <Panel id="ec-beat-editor" order={1} defaultSize={layout.beat} minSize={26} maxSize={62}>
          <EditorSurfaceTabs />
        </Panel>
        <PanelResizeHandle className={handleH} />
        <Panel id="ec-right" order={2} defaultSize={layout.right} minSize={28}>
          <RightColumn />
        </Panel>
      </PanelGroup>
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
