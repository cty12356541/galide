/**
 * useWorkspacePersistence — 工作区布局持久化(P5c + B2)
 *
 * renderer localStorage 持久化 dock/可见侧/子岛 + 最后预设 + per-preset 快照 + EditorCore 分栏。
 */
import { useEffect } from 'react'
import { useUiStore, type WorkspacePresetId } from '../store'
import { isFloatingWindow } from '../../app/FloatingPanelHost'
import {
  isToolWindowId,
  isSubIslandId,
  type ToolWindowId,
  type SubIslandId,
  type DockSide,
  type SlotContent
} from '../../components/workspace/mosaic/panel-registry'
import {
  DEFAULT_EDITOR_CORE_LAYOUT,
  WORKSPACE_PRESET_DEFAULTS,
  type EditorCoreLayout,
  type LayoutsByPreset
} from '../workspace-presets'

export const WORKSPACE_LAYOUT_KEY = 'galide.workspaceLayout.v1'
const PRESET_IDS: readonly WorkspacePresetId[] = ['writing', 'flow', 'review']
const TOOL_WINDOWS: readonly ToolWindowId[] = ['project', 'git', 'outline', 'character', 'ai']
const DOCK_SIDES: readonly DockSide[] = ['left', 'right', 'bottom']
const PLACEHOLDERS = new Set(['search', 'debug', 'settings'])

type VisiblePerSide = { left: SlotContent | null; right: SlotContent | null; bottom: SlotContent | null }

export interface PersistedWorkspaceLayout {
  dockSide: Record<ToolWindowId, DockSide>
  visiblePerSide: VisiblePerSide
  activeSubIsland: Record<ToolWindowId, SubIslandId>
  lastPreset?: WorkspacePresetId
  layoutsByPreset?: LayoutsByPreset
  editorCoreLayout?: EditorCoreLayout
  editorSurface?: 'cards' | 'source'
}

const isDockSide = (x: unknown): x is DockSide =>
  typeof x === 'string' && (DOCK_SIDES as readonly string[]).includes(x)

const isSubIslandValue = (x: unknown): x is SubIslandId =>
  typeof x === 'string' && isSubIslandId(x)

const isSlot = (x: unknown): boolean =>
  x === null || (typeof x === 'string' && (isToolWindowId(x) || PLACEHOLDERS.has(x)))

const isPresetId = (x: unknown): x is WorkspacePresetId =>
  typeof x === 'string' && (PRESET_IDS as readonly string[]).includes(x as WorkspacePresetId)

const isEditorCoreLayout = (x: unknown): x is EditorCoreLayout => {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return ['beat', 'right', 'sceneRail', 'flow', 'centerRow', 'preview'].every(
    (k) => typeof o[k] === 'number'
  )
}

const validate = (raw: unknown): PersistedWorkspaceLayout | null => {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const { dockSide, visiblePerSide, activeSubIsland } = o
  if (!dockSide || typeof dockSide !== 'object') return null
  if (!visiblePerSide || typeof visiblePerSide !== 'object') return null
  if (!activeSubIsland || typeof activeSubIsland !== 'object') return null
  const ds = dockSide as Record<string, unknown>
  const vis = visiblePerSide as Record<string, unknown>
  const asi = activeSubIsland as Record<string, unknown>
  for (const tw of TOOL_WINDOWS) {
    if (!isDockSide(ds[tw])) return null
    if (!isSubIslandValue(asi[tw])) return null
  }
  for (const side of DOCK_SIDES) {
    if (!isSlot(vis[side])) return null
  }
  const lastPreset = o.lastPreset
  if (lastPreset !== undefined && !isPresetId(lastPreset)) return null
  const editorCoreLayout = o.editorCoreLayout
  if (editorCoreLayout !== undefined && !isEditorCoreLayout(editorCoreLayout)) return null
  const editorSurface = o.editorSurface
  if (editorSurface !== undefined && editorSurface !== 'cards' && editorSurface !== 'source') {
    return null
  }
  return {
    dockSide: ds as Record<ToolWindowId, DockSide>,
    visiblePerSide: vis as VisiblePerSide,
    activeSubIsland: asi as Record<ToolWindowId, SubIslandId>,
    lastPreset: lastPreset as WorkspacePresetId | undefined,
    layoutsByPreset: o.layoutsByPreset as LayoutsByPreset | undefined,
    editorCoreLayout: editorCoreLayout as EditorCoreLayout | undefined,
    editorSurface: editorSurface as 'cards' | 'source' | undefined
  }
}

export const useWorkspacePersistence = (): void => {
  const floating = isFloatingWindow()
  const dockSide = useUiStore((s) => s.dockSide)
  const visiblePerSide = useUiStore((s) => s.visiblePerSide)
  const activeSubIsland = useUiStore((s) => s.activeSubIsland)
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
      useUiStore.setState({
        dockSide: layout.dockSide,
        visiblePerSide: layout.visiblePerSide,
        activeSubIsland: layout.activeSubIsland,
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
          dockSide,
          visiblePerSide,
          activeSubIsland,
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
  }, [
    floating,
    dockSide,
    visiblePerSide,
    activeSubIsland,
    workspacePreset,
    layoutsByPreset,
    editorCoreLayout,
    editorSurface
  ])
}
