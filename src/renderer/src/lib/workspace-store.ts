/** workspace-store — v3 扁平模型. panelStates 为 source of truth; 其余为派生字段. */
import { createStore } from 'zustand'
import { useStore } from 'zustand'
import type { ToolWindowId, SubIslandId, DockSide } from '../components/workspace/panels/panel-registry'
import { WORKSPACE_PRESET_DEFAULTS, DEFAULT_EDITOR_CORE_LAYOUT, captureWorkspaceSnapshot, type PanelState } from './workspace-presets'
import type { WorkspaceState } from './workspace-store.types'

const derive = (ps: Record<ToolWindowId, PanelState>) => {
  const v = { left: null as ToolWindowId | null, right: null as ToolWindowId | null, bottom: null as ToolWindowId | null }
  const d = {} as Record<ToolWindowId, DockSide>
  const a = {} as Record<ToolWindowId, SubIslandId>
  for (const [id, p] of Object.entries(ps) as [ToolWindowId, PanelState][]) {
    if (p.visible) v[p.dock] = id
    d[id] = p.dock
    a[id] = p.activeSub
  }
  return { visiblePerSide: v, dockSide: d, activeSubIsland: a }
}

const patchPanels = (s: WorkspaceState, p: Partial<Record<ToolWindowId, Partial<PanelState>>>) => {
  const ps = { ...s.panelStates }
  for (const [id, v] of Object.entries(p) as [ToolWindowId, Partial<PanelState>][]) ps[id] = { ...ps[id]!, ...v }
  const ordered = {} as Record<ToolWindowId, PanelState>
  for (const id of Object.keys(p) as ToolWindowId[]) ordered[id] = ps[id]!
  for (const [id, v] of Object.entries(ps) as [ToolWindowId, PanelState][]) if (!(id in ordered)) ordered[id] = v
  const seen: Record<DockSide, ToolWindowId | null> = { left: null, right: null, bottom: null }
  for (const [id, st] of Object.entries(ordered) as [ToolWindowId, PanelState][]) {
    if (st.visible && seen[st.dock]) ordered[id] = { ...st, visible: false }
    else if (st.visible) seen[st.dock] = id
  }
  return { panelStates: ordered, ...derive(ordered) }
}

export const workspaceStore = createStore<WorkspaceState>((set, get) => {
  const recompute = (s: WorkspaceState) => ({ ...s, ...derive(s.panelStates) })
  const setRecompute: typeof set = (partial) =>
    set((s) => {
      const next = { ...s, ...(typeof partial === 'function' ? partial(s) : partial) }
      return next.panelStates !== s.panelStates ? recompute(next) : next
    })

  const ps = { ...WORKSPACE_PRESET_DEFAULTS.writing.panelStates }
  return {
    workspacePreset: 'writing',
    layoutsByPreset: {},
    editorSurface: 'cards',
    panelStates: ps,
    floatingPanels: [],
    previewOpen: false,
    editorCoreLayout: { ...DEFAULT_EDITOR_CORE_LAYOUT },
    ...derive(ps),
    applyWorkspacePreset: (preset) => {
      const s = get()
      const layoutsByPreset = { ...s.layoutsByPreset, [s.workspacePreset]: captureWorkspaceSnapshot(s) }
      const snap = layoutsByPreset[preset] ?? WORKSPACE_PRESET_DEFAULTS[preset]
      setRecompute({ workspacePreset: preset, layoutsByPreset, previewOpen: snap.previewOpen, editorCoreLayout: { ...snap.editorCoreLayout }, panelStates: { ...snap.panelStates } })
    },
    setEditorCoreLayout: (layout) => setRecompute((s) => ({ editorCoreLayout: { ...s.editorCoreLayout, ...layout } })),
    setEditorSurface: (surface) => setRecompute({ editorSurface: surface }),
    setDockSide: (tw, side) => setRecompute((s) => patchPanels(s, { [tw]: { dock: side, visible: true } })),
    showToolWindow: (tw) => setRecompute((s) => patchPanels(s, { [tw]: { visible: true } })),
    hideToolWindow: (tw) => setRecompute((s) => patchPanels(s, { [tw]: { visible: false } })),
    toggleToolWindow: (tw) => setRecompute((s) => patchPanels(s, { [tw]: { visible: !s.panelStates[tw]!.visible } })),
    setActiveSubIsland: (tw, sub) => setRecompute((s) => patchPanels(s, { [tw]: { activeSub: sub } })),
    setPanelStates: (states) => setRecompute((s) => patchPanels(s, states)),
    toggleLeftPanel: () => setRecompute((s) => (s.visiblePerSide.left ? patchPanels(s, { [s.visiblePerSide.left]: { visible: false } }) : patchPanels(s, { project: { visible: true } }))),
    toggleAiPanel: () => setRecompute((s) => patchPanels(s, { ai: { visible: !s.panelStates.ai!.visible } })),
    setAiDockedLocation: (loc) => setRecompute((s) => patchPanels(s, { ai: { dock: loc, visible: true } })),
    setFloatingPanels: (panels) => setRecompute({ floatingPanels: panels }),
    addFloatingPanel: (panel) => setRecompute((s) => (s.floatingPanels.includes(panel) ? s : { floatingPanels: [...s.floatingPanels, panel] })),
    removeFloatingPanel: (panel) => setRecompute((s) => ({ floatingPanels: s.floatingPanels.filter((p) => p !== panel) })),
    setPreviewOpen: (open) => setRecompute((s) => ({ previewOpen: open !== undefined ? open : !s.previewOpen }))
  }
})

const origSetState = workspaceStore.setState.bind(workspaceStore)
workspaceStore.setState = ((partial, replace?) => {
  const s = workspaceStore.getState()
  const next = typeof partial === 'function' ? partial(s) : partial
  if (next && 'panelStates' in next && next.panelStates !== s.panelStates) {
    const n = { ...next, ...derive(next.panelStates as Record<ToolWindowId, PanelState>) }
    return replace ? origSetState(n as WorkspaceState, true) : origSetState(n, replace as false | undefined)
  }
  return replace ? origSetState(next as WorkspaceState, true) : origSetState(next, replace as false | undefined)
}) as typeof workspaceStore.setState

export const useWorkspaceStore = Object.assign(<U>(selector?: (state: WorkspaceState) => U) => useStore(workspaceStore, selector!) as U, { getState: workspaceStore.getState.bind(workspaceStore), setState: workspaceStore.setState.bind(workspaceStore), subscribe: workspaceStore.subscribe.bind(workspaceStore) })
