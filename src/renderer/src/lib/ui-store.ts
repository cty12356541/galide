/**
 * ui-store — 纯 UI 状态 Zustand store
 *
 * 本 store 只保留与项目/工作区/剧本无关的 UI 状态(主题、对话框、快捷键等)。
 * 跨 store 协调动作见 project-coordinator.ts。
 */
import { createStore } from 'zustand'
import { useStore } from 'zustand'
import type { PreferencesSection } from '../../../shared/preferences'
import type { RecentProject, SelectedNode } from './types'

export type Theme = 'light' | 'dark'

export type UiOnlyState = {
  theme: Theme
  commandPaletteOpen: boolean
  commandPaletteMode: 'all' | 'file'
  preferencesOpen: boolean
  preferencesSection: PreferencesSection
  exportDialogOpen: boolean
  commitDialogOpen: boolean
  newProjectDialogOpen: boolean
  /** Promise 式确认/输入对话框(promise-dialog-store)打开标记:modal guard + ESC 单源共用 */
  promiseDialogOpen: boolean
  shortcutRecording: boolean
  resolvedShortcuts: Partial<Record<string, string>>
  recentProjects: RecentProject[]
  selectedNode: SelectedNode
}

export type UiOnlyActions = {
  setRecentProjects: (recent: RecentProject[]) => void
  setTheme: (theme: Theme) => void
  setSelectedNode: (node: SelectedNode) => void
  toggleCommandPalette: (open?: boolean) => void
  openGoToFile: () => void
  openPreferences: (section?: PreferencesSection) => void
  closePreferences: () => void
  openExportDialog: () => void
  closeExportDialog: () => void
  openCommitDialog: () => void
  closeCommitDialog: () => void
  openNewProjectDialog: () => void
  closeNewProjectDialog: () => void
  openPromiseDialog: () => void
  closePromiseDialog: () => void
  dismissTopModal: () => void
  setShortcutRecording: (recording: boolean) => void
  setResolvedShortcuts: (shortcuts: Partial<Record<string, string>>) => void
}

export type UiStoreState = UiOnlyState & UiOnlyActions

const uiOnlyInitialState: UiOnlyState = {
  recentProjects: [],
  theme: 'light',
  selectedNode: null,
  commandPaletteOpen: false,
  commandPaletteMode: 'all',
  preferencesOpen: false,
  preferencesSection: 'ai',
  exportDialogOpen: false,
  commitDialogOpen: false,
  newProjectDialogOpen: false,
  promiseDialogOpen: false,
  shortcutRecording: false,
  resolvedShortcuts: {}
}

export const uiStore = createStore<UiStoreState>((set, _get) => ({
  ...uiOnlyInitialState,

  setRecentProjects: (recent) => set({ recentProjects: recent }),

  setTheme: (theme) => {
    set({ theme })
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark')
    }
  },

  setSelectedNode: (node) => set({ selectedNode: node }),

  toggleCommandPalette: (open) =>
    set((s) => {
      const next = open !== undefined ? open : !s.commandPaletteOpen
      return next
        ? { commandPaletteOpen: true, commandPaletteMode: 'all' as const }
        : { commandPaletteOpen: false }
    }),

  openGoToFile: () => set({ commandPaletteOpen: true, commandPaletteMode: 'file' }),

  openPreferences: (section) =>
    set({ preferencesOpen: true, preferencesSection: section ?? 'ai' }),

  closePreferences: () => set({ preferencesOpen: false }),

  openExportDialog: () => set({ exportDialogOpen: true }),

  closeExportDialog: () => set({ exportDialogOpen: false }),

  openCommitDialog: () => set({ commitDialogOpen: true }),

  closeCommitDialog: () => set({ commitDialogOpen: false }),

  openNewProjectDialog: () => set({ newProjectDialogOpen: true }),

  closeNewProjectDialog: () => set({ newProjectDialogOpen: false }),

  openPromiseDialog: () => set({ promiseDialogOpen: true }),

  closePromiseDialog: () => set({ promiseDialogOpen: false }),

  dismissTopModal: () =>
    set((s) => {
      if (s.promiseDialogOpen) return { promiseDialogOpen: false }
      if (s.commandPaletteOpen) return { commandPaletteOpen: false }
      if (s.exportDialogOpen) return { exportDialogOpen: false }
      if (s.commitDialogOpen) return { commitDialogOpen: false }
      if (s.newProjectDialogOpen) return { newProjectDialogOpen: false }
      if (s.preferencesOpen) return { preferencesOpen: false }
      return s
    }),

  setShortcutRecording: (recording) => set({ shortcutRecording: recording }),

  setResolvedShortcuts: (shortcuts) => set({ resolvedShortcuts: shortcuts })
}))

export const useUiOnlyStore: {
  (): UiStoreState
  <U>(selector: (state: UiStoreState) => U): U
  getState: typeof uiStore.getState
  setState: typeof uiStore.setState
  subscribe: typeof uiStore.subscribe
} = Object.assign(
  <U>(selector?: (state: UiStoreState) => U) => useStore(uiStore, selector!) as U,
  {
    getState: uiStore.getState.bind(uiStore),
    setState: uiStore.setState.bind(uiStore),
    subscribe: uiStore.subscribe.bind(uiStore)
  }
)
