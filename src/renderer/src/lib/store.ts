import { create } from 'zustand'
import type { ProjectManifest } from '../../../shared/types'
import type { PreferencesSection } from '../../../shared/preferences'
import type { RecentProject, ErrorEntry, SelectedNode } from './types'
import {
  DEFAULT_WORKSPACE_LAYOUT,
  applyWorkspacePreset as applyPresetPure,
  mergeWorkspaceLayout,
  type WorkspaceLayout,
  type WorkspacePresetId,
  type ActivityBarItemId,
  type RightDockId
} from './workspace-layout'

type Theme = 'light' | 'dark'

/** 老 EditorLayout 字段(保留兼容 — in-flight 改造后大部分组件切到 workspaceLayout,
 *  但 EditorArea / setLayout 之类暂留以避免大面积破坏老调用方) */
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
  projectPath: string | null
  projectName: string | null
  manifest: ProjectManifest | null
  activeScriptFile: string | null
  /** 规约 workspace_layout:6 区域布局(中央 tab / activity panel / right dock) */
  workspaceLayout: WorkspaceLayout
  /** 老布局字段(panel 宽窄比),保留以兼容 EditorArea。后续可弃用。 */
  layout: EditorLayout
  recentProjects: RecentProject[]
  theme: Theme
  selectedNode: SelectedNode
  commandPaletteOpen: boolean
  preferencesOpen: boolean
  preferencesSection: PreferencesSection
  exportDialogOpen: boolean
  commitDialogOpen: boolean
  /**
   * P1 修复(2026-06-13): "新建项目" 对话框开关。
   * 提升到 store 以便 CommandPalette 与 WelcomeScreen 共享同一对话框(避免硬编码 '新项目')。
   */
  newProjectDialogOpen: boolean
  /** 录制快捷键时为 true,App 级 keydown 监听器应当 early-return (P1-3 修复) */
  shortcutRecording: boolean
  /** 老 aiPanelOpen(保留兼容),与 workspaceLayout.rightDock 双向同步 */
  aiPanelOpen: boolean
  setProject: (projectPath: string, manifest: ProjectManifest) => void
  setActiveScript: (fileName: string | null) => void
  /**
   * 原子事务: 一次写入 activity/tabs/dock 三组状态(Rule 4)
   */
  applyWorkspacePreset: (presetId: WorkspacePresetId) => void
  /**
   * 启动时从持久化层恢复,字段缺失时降级到 DEFAULT_WORKSPACE_LAYOUT(Rule 6)
   */
  hydrateWorkspaceLayout: (stored: WorkspaceLayout | null | undefined) => void
  /**
   * 切换 Activity Bar 项的激活状态(multi-split)
   */
  toggleActivity: (id: ActivityBarItemId) => void
  /**
   * 设置右侧 Dock 内容(null 表示收起)
   */
  setRightDock: (id: RightDockId | null) => void
  setLayout: (layout: Partial<EditorLayout>) => void
  setRecentProjects: (recent: RecentProject[]) => void
  /** 老 API,内部同步到 setRightDock */
  toggleAiPanel: (open?: boolean) => void
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
  workspaceLayout: { ...DEFAULT_WORKSPACE_LAYOUT },
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
  aiPanelOpen: false,
  setProject: (projectPath, manifest) =>
    set({ projectPath, manifest, projectName: manifest.name }),
  setActiveScript: (fileName) => set({ activeScriptFile: fileName }),
  applyWorkspacePreset: (presetId) =>
    set((s) => {
      const next = applyPresetPure(s.workspaceLayout, presetId)
      return {
        workspaceLayout: next,
        // 同步老 aiPanelOpen 字段以兼容
        aiPanelOpen: next.rightDock !== null
      }
    }),
  hydrateWorkspaceLayout: (stored) =>
    set((s) => {
      const merged = mergeWorkspaceLayout(stored, s.workspaceLayout)
      return {
        workspaceLayout: merged,
        aiPanelOpen: merged.rightDock !== null
      }
    }),
  toggleActivity: (id) =>
    set((s) => {
      const current = s.workspaceLayout.activeActivity
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      return {
        workspaceLayout: { ...s.workspaceLayout, activeActivity: next }
      }
    }),
  setRightDock: (id) =>
    set((s) => ({
      workspaceLayout: { ...s.workspaceLayout, rightDock: id },
      aiPanelOpen: id !== null
    })),
  setLayout: (layout) => set((s) => ({ layout: { ...s.layout, ...layout } })),
  setRecentProjects: (recent) => set({ recentProjects: recent }),
  toggleAiPanel: (open) =>
    set((s) => {
      const next = open !== undefined ? open : !s.aiPanelOpen
      return {
        aiPanelOpen: next,
        workspaceLayout: {
          ...s.workspaceLayout,
          rightDock: next ? 'ai' : null
        }
      }
    }),
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

type ErrorState = {
  entries: ErrorEntry[]
  push: (entry: Omit<ErrorEntry, 'id' | 'timestamp'>) => void
  dismiss: (id: string) => void
  clear: () => void
}

/**
 * T1 §4.4 P1-9 / T3 §4 P1-9 修复(2026-06-14): useErrorStore LRU 上限
 * 防长会话持续报错时 entries 无限增长(AI provider 不可用 + 高频操作场景)。
 * 实测: 10 分钟 × 每秒 1 次 ≈ 600 entries × 200B ≈ 120KB / 10min。
 * 截断到最近 100 条,旧错误自然淘汰。
 */
const MAX_ERROR_ENTRIES = 100

export const useErrorStore = create<ErrorState>((set) => ({
  entries: [],
  push: (entry) =>
    set((s) => {
      const next = [
        ...s.entries,
        { ...entry, id: crypto.randomUUID(), timestamp: Date.now() }
      ]
      return { entries: next.length > MAX_ERROR_ENTRIES ? next.slice(-MAX_ERROR_ENTRIES) : next }
    }),
  dismiss: (id) =>
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
  clear: () => set({ entries: [] })
}))
