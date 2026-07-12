import type { ToolWindowId, SubIslandId, DockSide } from '../components/workspace/mosaic/panel-registry'
import type { WorkspacePresetId, EditorCoreLayout, LayoutsByPreset, PanelState } from './workspace-presets'

type Visible = { left: ToolWindowId | null; right: ToolWindowId | null; bottom: ToolWindowId | null }

export type WorkspaceSliceState = {
  workspacePreset: WorkspacePresetId
  layoutsByPreset: LayoutsByPreset
  editorSurface: 'cards' | 'source'
  panelStates: Record<ToolWindowId, PanelState>
  floatingPanels: readonly string[]
  previewOpen: boolean
  editorCoreLayout: EditorCoreLayout
  visiblePerSide: Visible
  dockSide: Record<ToolWindowId, DockSide>
  activeSubIsland: Record<ToolWindowId, SubIslandId>
}

export type WorkspaceSliceActions = {
  applyWorkspacePreset: (preset: WorkspacePresetId) => void
  setEditorCoreLayout: (layout: Partial<EditorCoreLayout>) => void
  setEditorSurface: (surface: 'cards' | 'source') => void
  setDockSide: (tw: ToolWindowId, side: DockSide) => void
  showToolWindow: (tw: ToolWindowId) => void
  hideToolWindow: (tw: ToolWindowId) => void
  toggleToolWindow: (tw: ToolWindowId) => void
  setActiveSubIsland: (tw: ToolWindowId, sub: SubIslandId) => void
  setPanelStates: (states: Partial<Record<ToolWindowId, Partial<PanelState>>>) => void
  toggleLeftPanel: () => void
  toggleAiPanel: () => void
  setAiDockedLocation: (loc: DockSide) => void
  setFloatingPanels: (panels: readonly string[]) => void
  addFloatingPanel: (panel: string) => void
  removeFloatingPanel: (panel: string) => void
  setPreviewOpen: (open?: boolean) => void
}

export type WorkspaceState = WorkspaceSliceState & WorkspaceSliceActions
