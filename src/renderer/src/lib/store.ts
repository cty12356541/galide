import { create } from 'zustand'
import type { ProjectManifest } from '../../../shared/types'
import type { PreferencesSection } from '../../../shared/preferences'
import type { EditorLayout, RecentProject, ErrorEntry, SelectedNode } from './types'

type Theme = 'light' | 'dark'

type UiState = {
  projectPath: string | null
  projectName: string | null
  manifest: ProjectManifest | null
  activeScriptFile: string | null
  layout: EditorLayout
  recentProjects: RecentProject[]
  aiPanelOpen: boolean
  theme: Theme
  selectedNode: SelectedNode
  commandPaletteOpen: boolean
  preferencesOpen: boolean
  preferencesSection: PreferencesSection
  exportDialogOpen: boolean
  commitDialogOpen: boolean
  /** 录制快捷键时为 true,App 级 keydown 监听器应当 early-return (P1-3 修复) */
  shortcutRecording: boolean
  setProject: (projectPath: string, manifest: ProjectManifest) => void
  setActiveScript: (fileName: string | null) => void
  setLayout: (layout: Partial<EditorLayout>) => void
  setRecentProjects: (recent: RecentProject[]) => void
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
  closeProject: () => void
  setShortcutRecording: (recording: boolean) => void
}

const defaultLayout: EditorLayout = {
  sidebar: 18,
  editor: 46,
  flow: 18,
  preview: 18
}

export const useUiStore = create<UiState>((set) => ({
  projectPath: null,
  projectName: null,
  manifest: null,
  activeScriptFile: 'chapter1.gal',
  layout: defaultLayout,
  recentProjects: [],
  aiPanelOpen: false,
  theme: 'light',
  selectedNode: null,
  commandPaletteOpen: false,
  preferencesOpen: false,
  preferencesSection: 'ai',
  exportDialogOpen: false,
  commitDialogOpen: false,
  shortcutRecording: false,
  setProject: (projectPath, manifest) =>
    set({ projectPath, manifest, projectName: manifest.name }),
  setActiveScript: (fileName) => set({ activeScriptFile: fileName }),
  setLayout: (layout) => set((s) => ({ layout: { ...s.layout, ...layout } })),
  setRecentProjects: (recent) => set({ recentProjects: recent }),
  toggleAiPanel: (open) =>
    set((s) => ({ aiPanelOpen: open !== undefined ? open : !s.aiPanelOpen })),
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
