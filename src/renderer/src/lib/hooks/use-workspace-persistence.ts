/**
 * useWorkspacePersistence — 工作区布局持久化(P5c + B2)
 *
 * renderer localStorage 持久化 panelStates + 最后预设 + per-preset 快照 + EditorCore 分栏。
 * 仍可读旧版(dockSide/visiblePerSide/activeSubIsland)并转换为 panelStates。
 */
import { useEffect } from 'react'
import { useUiStore, type WorkspacePresetId } from '../store'
import { useWorkspaceStore } from '../workspace-store'
import { isFloatingWindow } from '../../app/FloatingPanelHost'
import {
  TOOL_WINDOW_IDS,
  isSubIslandId,
  isToolWindowId,
  type ToolWindowId,
  type SubIslandId,
  type DockSide
} from '../../components/workspace/panels/panel-registry'
import {
  DEFAULT_EDITOR_CORE_LAYOUT,
  WORKSPACE_PRESET_DEFAULTS,
  type PanelState,
  type EditorCoreLayout,
  type LayoutsByPreset
} from '../workspace-presets'

export const WORKSPACE_LAYOUT_KEY = 'galide.workspaceLayout.v1'
const PRESET_IDS: readonly WorkspacePresetId[] = ['writing', 'flow', 'review']
const DOCK_SIDES: readonly DockSide[] = ['left', 'right', 'bottom']
const LEGACY_TOOL_WINDOWS: readonly ToolWindowId[] = ['project', 'git', 'outline', 'character', 'ai']

type LegacyVisible = { left: string | null; right: string | null; bottom: string | null }

export interface PersistedWorkspaceLayout {
  panelStates?: Record<ToolWindowId, PanelState>
  dockSide?: Record<ToolWindowId, DockSide>
  visiblePerSide?: LegacyVisible
  activeSubIsland?: Record<ToolWindowId, SubIslandId>
  lastPreset?: WorkspacePresetId
  layoutsByPreset?: LayoutsByPreset
  editorCoreLayout?: EditorCoreLayout
  editorSurface?: 'cards' | 'source'
}

const isDockSide = (x: unknown): x is DockSide =>
  typeof x === 'string' && (DOCK_SIDES as readonly string[]).includes(x)

const isSubIslandValue = (x: unknown): x is SubIslandId =>
  typeof x === 'string' && isSubIslandId(x)

const isPanelState = (x: unknown): x is PanelState => {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.visible === 'boolean' && isDockSide(o.dock) && isSubIslandValue(o.activeSub)
}

const isPanelStates = (x: unknown): x is Record<ToolWindowId, PanelState> => {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return TOOL_WINDOW_IDS.every((tw) => isPanelState(o[tw]))
}

const isLegacySlot = (x: unknown): x is string | null =>
  x === null || (typeof x === 'string' && (isToolWindowId(x) || x === 'search' || x === 'debug' || x === 'settings'))

const isLegacyVisible = (x: unknown): x is LegacyVisible => {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return DOCK_SIDES.every((side) => isLegacySlot(o[side]))
}

const isPresetId = (x: unknown): x is WorkspacePresetId =>
  typeof x === 'string' && (PRESET_IDS as readonly string[]).includes(x as WorkspacePresetId)

const isEditorCoreLayout = (x: unknown): x is EditorCoreLayout => {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return ['beat', 'right', 'sceneRail', 'flow', 'centerRow', 'preview'].every(
    (k) => typeof o[k] === 'number'
  )
}

const buildPanelStatesFromLegacy = (
  dockSide: Record<ToolWindowId, DockSide>,
  visiblePerSide: LegacyVisible,
  activeSubIsland: Record<ToolWindowId, SubIslandId>
): Record<ToolWindowId, PanelState> => {
  const ps = { ...WORKSPACE_PRESET_DEFAULTS.writing.panelStates }
  for (const tw of LEGACY_TOOL_WINDOWS) {
    ps[tw] = { visible: visiblePerSide[dockSide[tw]] === tw, dock: dockSide[tw], activeSub: activeSubIsland[tw] }
  }
  return ps
}

const validate = (raw: unknown): PersistedWorkspaceLayout | null => {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>

  if (o.panelStates && isPanelStates(o.panelStates)) {
    return {
      panelStates: o.panelStates as Record<ToolWindowId, PanelState>,
      lastPreset: o.lastPreset !== undefined && isPresetId(o.lastPreset) ? o.lastPreset : undefined,
      layoutsByPreset: o.layoutsByPreset as LayoutsByPreset | undefined,
      editorCoreLayout: o.editorCoreLayout !== undefined && isEditorCoreLayout(o.editorCoreLayout) ? o.editorCoreLayout : undefined,
      editorSurface: o.editorSurface !== undefined && (o.editorSurface === 'cards' || o.editorSurface === 'source') ? o.editorSurface : undefined
    }
  }

  const { dockSide, visiblePerSide, activeSubIsland } = o
  if (!dockSide || typeof dockSide !== 'object') return null
  if (!visiblePerSide || typeof visiblePerSide !== 'object') return null
  if (!activeSubIsland || typeof activeSubIsland !== 'object') return null
  const ds = dockSide as Record<string, unknown>
  const asi = activeSubIsland as Record<string, unknown>
  for (const tw of LEGACY_TOOL_WINDOWS) {
    if (!isDockSide(ds[tw])) return null
    if (!isSubIslandValue(asi[tw])) return null
  }
  if (!isLegacyVisible(visiblePerSide)) return null
  return {
    dockSide: ds as Record<ToolWindowId, DockSide>,
    visiblePerSide: visiblePerSide as LegacyVisible,
    activeSubIsland: asi as Record<ToolWindowId, SubIslandId>,
    lastPreset: o.lastPreset !== undefined && isPresetId(o.lastPreset) ? o.lastPreset : undefined,
    layoutsByPreset: o.layoutsByPreset as LayoutsByPreset | undefined,
    editorCoreLayout: o.editorCoreLayout !== undefined && isEditorCoreLayout(o.editorCoreLayout) ? o.editorCoreLayout : undefined,
    editorSurface: o.editorSurface !== undefined && (o.editorSurface === 'cards' || o.editorSurface === 'source') ? o.editorSurface : undefined
  }
}

export const useWorkspacePersistence = (): void => {
  const floating = isFloatingWindow()
  const panelStates = useWorkspaceStore((s) => s.panelStates)
  const workspacePreset = useUiStore((s) => s.workspacePreset)
  const layoutsByPreset = useUiStore((s) => s.layoutsByPreset)
  const editorCoreLayout = useUiStore((s) => s.editorCoreLayout)
  const editorSurface = useUiStore((s) => s.editorSurface)

  useEffect(() => {
    if (floating) return
    try {
      const raw = window.localStorage.getItem(WORKSPACE_LAYOUT_KEY)
      if (!raw) return
      const layout = validate(JSON.parse(raw))
      if (!layout) return
      const preset = layout.lastPreset ?? 'writing'
      const snapshot = layout.layoutsByPreset?.[preset] ?? WORKSPACE_PRESET_DEFAULTS[preset]
      const restored = layout.panelStates
        ? layout.panelStates
        : buildPanelStatesFromLegacy(layout.dockSide!, layout.visiblePerSide!, layout.activeSubIsland!)
      const st = useWorkspaceStore.getState()
      st.setPanelStates(restored)
      useWorkspaceStore.setState({
        workspacePreset: preset,
        layoutsByPreset: layout.layoutsByPreset ?? {},
        editorCoreLayout: layout.editorCoreLayout ?? snapshot.editorCoreLayout ?? DEFAULT_EDITOR_CORE_LAYOUT,
        editorSurface: layout.editorSurface ?? 'cards',
        previewOpen: snapshot.previewOpen ?? false
      })
    } catch {
      // 坏数据静默丢弃
    }
  }, [floating])

  useEffect(() => {
    if (floating) return
    const id = setTimeout(() => {
      try {
        const payload: PersistedWorkspaceLayout = {
          panelStates,
          lastPreset: workspacePreset,
          layoutsByPreset,
          editorCoreLayout,
          editorSurface
        }
        window.localStorage.setItem(WORKSPACE_LAYOUT_KEY, JSON.stringify(payload))
      } catch {
        // 配额/隐私模式:忽略
      }
    }, 300)
    return () => clearTimeout(id)
  }, [floating, panelStates, workspacePreset, layoutsByPreset, editorCoreLayout, editorSurface])
}
