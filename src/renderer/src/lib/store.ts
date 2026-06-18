/**
 * Galide renderer 端 zustand store
 *
 * P1 重构(2026-06-17): 删掉 `workspaceLayout: WorkspaceLayout` 嵌套对象(治本)
 *   - 不再序列化、不再 hydrate、不再 debounce 写盘、不再用 useRef + useEffect 绕 deps
 *   - 改 5 个独立标量字段: workspacePreset / leftPanelOpen / leftPanel / aiPanelOpen / aiPanelDocked
 *   - 单一职责,UI 状态走 React,持久化(如有需要)走 useUiStore.subscribe + IPC 监听
 *
 * 设计原则:
 *   - 标量字段优先于嵌套对象:细粒度订阅,避免无关组件 re-render
 *   - action 简短(1-2 行 set),复杂逻辑(preset 应用)放 hook 层
 *   - 主题切换 setTheme 仍包含 DOM 副作用(toggle .dark class),但用 useEffect 在 App 层
 *     监听 theme 变化统一处理,不在 set 中(避免 SSR / happy-dom 环境下崩)
 */
import { create } from 'zustand'
import type { ProjectManifest } from '../../../shared/types'
import type { PreferencesSection } from '../../../shared/preferences'
import type { RecentProject, ErrorEntry, SelectedNode } from './types'
import type { PanelId } from '../components/workspace/mosaic/panel-registry'
import type { MosaicNode } from 'react-mosaic-component'

export type WorkspacePresetId = 'writing' | 'flow' | 'review'

/**
 * Mosaic 树节点 — 字符串叶子是 panel id
 * 与 PR2 组件岛风格配合
 */
export type WorkspaceMosaicNode = MosaicNode<PanelId>
export type LeftPanelId = 'project' | 'git' | 'closed'

export type ActivitySelection = 'project' | 'search' | 'git' | 'outline' | 'character' | 'voice' | 'asset' | 'debug' | 'settings'
export type AiDockedLocation = 'right' | 'bottom' | 'left' | 'floating'

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

type UiState = {
  // project
  projectPath: string | null
  projectName: string | null
  manifest: ProjectManifest | null
  activeScriptFile: string | null

  // workspace (P1 重构: 标量化)
  workspacePreset: WorkspacePresetId
  leftPanelOpen: boolean
  leftPanel: LeftPanelId
  activitySelection: ActivitySelection
  /** 左槽当前显示的侧边岛(功能模块即岛,ActivityBar 单选) */
  activeSidePanel: PanelId
  aiPanelOpen: boolean
  aiDockedLocation: AiDockedLocation
  /** P2: mosaic 树,字符串叶子 = panel id。null = 还没初始化 */
  mosaicTree: WorkspaceMosaicNode | null
  /** P2: 浮出独立 BrowserWindow 的 panel 列表 */
  floatingPanels: readonly PanelId[]

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
  toggleLeftPanel: () => void
  setLeftPanel: (id: LeftPanelId) => void
  setActivitySelection: (sel: ActivitySelection) => void
  setActiveSidePanel: (panel: PanelId) => void
  toggleAiPanel: () => void
  setAiDockedLocation: (loc: AiDockedLocation) => void
  setMosaicTree: (tree: WorkspaceMosaicNode) => void
  setFloatingPanels: (panels: readonly PanelId[]) => void
  addFloatingPanel: (panel: PanelId) => void
  removeFloatingPanel: (panel: PanelId) => void
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

export const useUiStore = create<UiState>((set) => ({
  projectPath: null,
  projectName: null,
  manifest: null,
  activeScriptFile: 'chapter1.gal',
  workspacePreset: 'writing',
  leftPanelOpen: true,
  leftPanel: 'project',
  activitySelection: 'project',
  activeSidePanel: 'project',
  aiPanelOpen: true,
  aiDockedLocation: 'right',
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
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  setLeftPanel: (id) => set({ leftPanel: id, leftPanelOpen: id !== 'closed' }),
  setActivitySelection: (sel) =>
    set(() => {
      // 6 个真实功能岛同步 activeSidePanel(search/debug/settings 走占位)
      if (sel === 'project' || sel === 'git') {
        return { activitySelection: sel, leftPanel: sel, activeSidePanel: sel, leftPanelOpen: true }
      }
      if (sel === 'outline' || sel === 'character' || sel === 'voice' || sel === 'asset') {
        return { activitySelection: sel, activeSidePanel: sel, leftPanelOpen: true }
      }
      return { activitySelection: sel, leftPanelOpen: true }
    }),
  setActiveSidePanel: (panel) => set({ activeSidePanel: panel, leftPanelOpen: true }),
  toggleAiPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  setAiDockedLocation: (loc) => set({ aiDockedLocation: loc }),
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
      // P1 重构: 接受宽松输入(id / timestamp 缺省时自动补),兼容老调用方
      const id = entry.id ?? crypto.randomUUID()
      const timestamp = entry.timestamp ?? Date.now()
      const without = s.entries.filter((e) => e.id !== id)
      const next = [{ ...entry, id, timestamp }, ...without].slice(0, MAX_ERROR_ENTRIES)
      return { entries: next }
    }),
  dismiss: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
  clear: () => set({ entries: [] })
}))
