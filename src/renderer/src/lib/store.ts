/**
 * Galide renderer 端 zustand store
 *
 * 功能即岛 v2(2026-06-19):主岛/子岛二级群岛 + dock 可移动
 *   - 删除 v1 的 leftPanelOpen/leftPanel/activitySelection/activeSidePanel/
 *     aiPanelOpen/aiDockedLocation 标量
 *   - 改 dockSide(每主岛 dock 侧)+ visiblePerSide(每侧可见主岛)+
 *     activeSubIsland(每主岛当前 tab)三组状态
 *   - 保留 toggleLeftPanel/toggleAiPanel/setAiDockedLocation 动作名,
 *     在新模型上重实现,避免 MenuBar/Toolbar/StatusBar/快捷键大面积改动
 *
 * 设计原则:
 *   - 标量字段优先于嵌套对象:细粒度订阅,避免无关组件 re-render
 *   - 主题切换 setTheme 含 DOM 副作用,用 App 层 effect 统一处理(不在 set 内)
 */
import { create } from 'zustand'
import type { ProjectManifest } from '../../../shared/types'
import type { PreferencesSection } from '../../../shared/preferences'
import type { RecentProject, ErrorEntry, SelectedNode } from './types'
import type {
  EditorDocId,
  ToolWindowId,
  SubIslandId,
  PlaceholderId,
  DockSide,
  SlotContent
} from '../components/workspace/mosaic/panel-registry'
import type { MosaicNode } from 'react-mosaic-component'

export type WorkspacePresetId = 'writing' | 'flow' | 'review'

/** Mosaic 树节点 — 字符串叶子是 EditorDocId(编辑器大陆) */
export type WorkspaceMosaicNode = MosaicNode<EditorDocId>

type Theme = 'light' | 'dark'

/** 老 EditorLayout 字段(保留兼容,后续可弃用) */
type EditorLayout = {
  sidebar: number
  editor: number
  flow: number
  preview: number
}

const defaultLayout: EditorLayout = {
  sidebar: 18,
  editor: 46,
  flow: 18,
  preview: 18
}

/** 每侧可见内容 */
type VisiblePerSide = {
  left: SlotContent | null
  right: SlotContent | null
  bottom: SlotContent | null
}

/** 浮出 id(主岛 / 子岛 / 编辑器大陆) */
type FloatingId = ToolWindowId | SubIslandId | EditorDocId

type UiState = {
  // project
  projectPath: string | null
  projectName: string | null
  manifest: ProjectManifest | null
  activeScriptFile: string | null

  // workspace(功能即岛 v2:dock 模型)
  workspacePreset: WorkspacePresetId
  dockSide: Record<ToolWindowId, DockSide>
  visiblePerSide: VisiblePerSide
  activeSubIsland: Record<ToolWindowId, SubIslandId>
  mosaicTree: WorkspaceMosaicNode | null
  floatingPanels: readonly FloatingId[]

  // editor layout (保留兼容)
  layout: EditorLayout

  // UI state
  theme: Theme
  commandPaletteOpen: boolean
  preferencesOpen: boolean
  preferencesSection: PreferencesSection
  exportDialogOpen: boolean
  commitDialogOpen: boolean
  newProjectDialogOpen: boolean
  shortcutRecording: boolean

  // recent
  recentProjects: RecentProject[]
  selectedNode: SelectedNode

  // actions
  setProject: (projectPath: string, manifest: ProjectManifest) => void
  setActiveScript: (fileName: string | null) => void
  setWorkspacePreset: (preset: WorkspacePresetId) => void
  setDockSide: (tw: ToolWindowId, side: DockSide) => void
  showToolWindow: (tw: ToolWindowId) => void
  hideToolWindow: (tw: ToolWindowId) => void
  toggleToolWindow: (tw: ToolWindowId) => void
  setActiveSubIsland: (tw: ToolWindowId, sub: SubIslandId) => void
  showPlaceholder: (p: PlaceholderId) => void
  // 兼容动作(在新模型上重实现)
  toggleLeftPanel: () => void
  toggleAiPanel: () => void
  setAiDockedLocation: (loc: DockSide) => void
  setMosaicTree: (tree: WorkspaceMosaicNode) => void
  setFloatingPanels: (panels: readonly FloatingId[]) => void
  addFloatingPanel: (panel: FloatingId) => void
  removeFloatingPanel: (panel: FloatingId) => void
  setLayout: (layout: Partial<EditorLayout>) => void
  setRecentProjects: (recent: RecentProject[]) => void
  setTheme: (theme: Theme) => void
  setSelectedNode: (node: SelectedNode) => void
  toggleCommandPalette: (open?: boolean) => void
  openPreferences: (section?: PreferencesSection) => void
  closePreferences: () => void
  openExportDialog: () => void
  closeExportDialog: () => void
  openCommitDialog: () => void
  closeCommitDialog: () => void
  openNewProjectDialog: () => void
  closeNewProjectDialog: () => void
  closeProject: () => void
  setShortcutRecording: (recording: boolean) => void
}

// 默认值硬编码(不从 registry 运行时导入,避免 store ↔ panel-registry ↔ feature 循环依赖
// 在模块求值期读到未完成的 registry 导出)。与 panel-registry 默认值保持一致。
const DEFAULT_DOCK_SIDE: Record<ToolWindowId, DockSide> = {
  project: 'left',
  git: 'left',
  outline: 'left',
  character: 'left',
  ai: 'right'
}

const DEFAULT_ACTIVE_SUB: Record<ToolWindowId, SubIslandId> = {
  project: 'scripts',
  git: 'git',
  outline: 'outline',
  character: 'profiles',
  ai: 'ai'
}

const DEFAULT_VISIBLE: VisiblePerSide = {
  left: 'project',
  right: 'ai',
  bottom: null
}

export const useUiStore = create<UiState>((set) => ({
  projectPath: null,
  projectName: null,
  manifest: null,
  activeScriptFile: 'chapter1.gal',
  workspacePreset: 'writing',
  dockSide: { ...DEFAULT_DOCK_SIDE },
  visiblePerSide: { ...DEFAULT_VISIBLE },
  activeSubIsland: { ...DEFAULT_ACTIVE_SUB },
  mosaicTree: null,
  floatingPanels: [],
  layout: defaultLayout,
  recentProjects: [],
  theme: 'light',
  selectedNode: null,
  commandPaletteOpen: false,
  preferencesOpen: false,
  preferencesSection: 'ai',
  exportDialogOpen: false,
  commitDialogOpen: false,
  newProjectDialogOpen: false,
  shortcutRecording: false,

  setProject: (projectPath, manifest) =>
    set({ projectPath, manifest, projectName: manifest.name }),
  setActiveScript: (fileName) => set({ activeScriptFile: fileName }),
  setWorkspacePreset: (preset) => set({ workspacePreset: preset }),

  setDockSide: (tw, side) =>
    set((s) => {
      const old = s.dockSide[tw]
      const wasVisible = s.visiblePerSide[old] === tw
      const nextDock = { ...s.dockSide, [tw]: side }
      let vis = { ...s.visiblePerSide }
      // 若该主岛原侧可见,跟随移到新侧(旧侧清空)
      if (wasVisible) {
        vis = { ...vis, [old]: null, [side]: tw }
      }
      return { dockSide: nextDock, visiblePerSide: vis }
    }),

  showToolWindow: (tw) =>
    set((s) => {
      const side = s.dockSide[tw]
      return { visiblePerSide: { ...s.visiblePerSide, [side]: tw } }
    }),

  hideToolWindow: (tw) =>
    set((s) => {
      const side = s.dockSide[tw]
      if (s.visiblePerSide[side] !== tw) return s
      return { visiblePerSide: { ...s.visiblePerSide, [side]: null } }
    }),

  toggleToolWindow: (tw) =>
    set((s) => {
      const side = s.dockSide[tw]
      const visible = s.visiblePerSide[side] === tw
      return {
        visiblePerSide: { ...s.visiblePerSide, [side]: visible ? null : tw }
      }
    }),

  setActiveSubIsland: (tw, sub) =>
    set((s) => ({ activeSubIsland: { ...s.activeSubIsland, [tw]: sub } })),

  showPlaceholder: (p) =>
    set((s) => ({ visiblePerSide: { ...s.visiblePerSide, left: p } })),

  // 兼容动作:toggleLeftPanel = 切换左槽(有内容则收起,无则显 project)
  toggleLeftPanel: () =>
    set((s) => ({
      visiblePerSide: {
        ...s.visiblePerSide,
        left: s.visiblePerSide.left !== null ? null : 'project'
      }
    })),

  // 兼容动作:toggleAiPanel = 切换 AI 主岛可见性
  toggleAiPanel: () =>
    set((s) => {
      const side = s.dockSide.ai
      const visible = s.visiblePerSide[side] === 'ai'
      return {
        visiblePerSide: { ...s.visiblePerSide, [side]: visible ? null : 'ai' }
      }
    }),

  // 兼容动作:setAiDockedLocation = 移 AI 到指定侧并显示
  setAiDockedLocation: (loc) =>
    set((s) => {
      const old = s.dockSide.ai
      const nextDock = { ...s.dockSide, ai: loc }
      let vis = { ...s.visiblePerSide }
      if (vis[old] === 'ai') vis = { ...vis, [old]: null }
      vis = { ...vis, [loc]: 'ai' }
      return { dockSide: nextDock, visiblePerSide: vis }
    }),

  setMosaicTree: (tree) => set({ mosaicTree: tree }),
  setFloatingPanels: (panels) => set({ floatingPanels: panels }),
  addFloatingPanel: (panel) =>
    set((s) =>
      s.floatingPanels.includes(panel)
        ? s
        : { floatingPanels: [...s.floatingPanels, panel] }
    ),
  removeFloatingPanel: (panel) =>
    set((s) => ({ floatingPanels: s.floatingPanels.filter((p) => p !== panel) })),
  setLayout: (layout) => set((s) => ({ layout: { ...s.layout, ...layout } })),
  setRecentProjects: (recent) => set({ recentProjects: recent }),
  setTheme: (theme) => {
    set({ theme })
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark')
    }
  },
  setSelectedNode: (node) => set({ selectedNode: node }),
  toggleCommandPalette: (open) =>
    set((s) => ({ commandPaletteOpen: open !== undefined ? open : !s.commandPaletteOpen })),
  openPreferences: (section) =>
    set({ preferencesOpen: true, preferencesSection: section ?? 'ai' }),
  closePreferences: () => set({ preferencesOpen: false }),
  openExportDialog: () => set({ exportDialogOpen: true }),
  closeExportDialog: () => set({ exportDialogOpen: false }),
  openCommitDialog: () => set({ commitDialogOpen: true }),
  closeCommitDialog: () => set({ commitDialogOpen: false }),
  openNewProjectDialog: () => set({ newProjectDialogOpen: true }),
  closeNewProjectDialog: () => set({ newProjectDialogOpen: false }),
  closeProject: () =>
    set({
      projectPath: null,
      manifest: null,
      projectName: null,
      activeScriptFile: 'chapter1.gal',
      selectedNode: null
    }),
  setShortcutRecording: (recording) => set({ shortcutRecording: recording })
}))

type ErrorPushInput = Omit<ErrorEntry, 'id' | 'timestamp'> & {
  id?: string
  timestamp?: number
}

type ErrorState = {
  entries: ErrorEntry[]
  push: (entry: ErrorPushInput) => void
  dismiss: (id: string) => void
  clear: () => void
}

const MAX_ERROR_ENTRIES = 100

export const useErrorStore = create<ErrorState>((set) => ({
  entries: [],
  push: (entry) =>
    set((s) => {
      const id = entry.id ?? crypto.randomUUID()
      const timestamp = entry.timestamp ?? Date.now()
      const without = s.entries.filter((e) => e.id !== id)
      const next = [{ ...entry, id, timestamp }, ...without].slice(0, MAX_ERROR_ENTRIES)
      return { entries: next }
    }),
  dismiss: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
  clear: () => set({ entries: [] })
}))
