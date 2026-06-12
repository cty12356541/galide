import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { ScriptEditor } from '../features/script-editor/ScriptEditor'
import { FlowView } from '../features/flow-view/FlowView'
import { PreviewCanvas } from '../features/preview/PreviewCanvas'
import { CharacterListPanel } from '../features/character/CharacterListPanel'
import { useUiStore } from '../lib/store'

const ResizeHandle = (): JSX.Element => (
  <PanelResizeHandle className="w-1.5 hover:bg-accent/20 transition-colors data-[resize-handle-state=hover]:bg-accent/30 data-[resize-handle-state=drag]:bg-accent/40" />
)

export const EditorArea = (): JSX.Element => {
  const layout = useUiStore((s) => s.layout)
  const setLayout = useUiStore((s) => s.setLayout)

  return (
    <div className="flex-1 overflow-hidden bg-bg">
      <PanelGroup direction="horizontal" autoSaveId="galide-layout">
        <Panel
          defaultSize={layout.sidebar}
          minSize={12}
          maxSize={30}
          onResize={(size) => setLayout({ sidebar: size })}
        >
          <CharacterListPanel />
        </Panel>
        <ResizeHandle />
        <Panel
          defaultSize={layout.editor}
          minSize={25}
          onResize={(size) => setLayout({ editor: size })}
        >
          <ScriptEditor />
        </Panel>
        <ResizeHandle />
        <Panel
          defaultSize={layout.flow}
          minSize={15}
          onResize={(size) => setLayout({ flow: size })}
        >
          <FlowView />
        </Panel>
        <ResizeHandle />
        <Panel
          defaultSize={layout.preview}
          minSize={15}
          onResize={(size) => setLayout({ preview: size })}
        >
          <PreviewCanvas />
        </Panel>
      </PanelGroup>
    </div>
  )
}
