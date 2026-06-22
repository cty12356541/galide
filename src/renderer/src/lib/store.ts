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
import type { ScriptNode } from '../../../shared/dsl/types'
import type {
  EditorDocId,
  ToolWindowId,
  SubIslandId,
  PlaceholderId,
  DockSide,
  SlotContent
} from '../components/workspace/mosaic/panel-registry'

import {
  WORKSPACE_PRESET_DEFAULTS,
  DEFAULT_EDITOR_CORE_LAYOUT,
  captureWorkspaceSnapshot,
  type WorkspacePresetId,
  type EditorCoreLayout,
  type LayoutsByPreset
} from './workspace-presets'
import {
  createScriptSlice,
  type ScriptSliceActions,
  type ScriptSliceState
} from './script-store'

export type { WorkspacePresetId, EditorCoreLayout, LayoutsByPreset }
export type { ScriptSliceState, ScriptSliceActions } from './script-store'

type Theme = 'light' | 'dark'

export type EditorSurface = 'cards' | 'source'

/** 每侧可见内容 */
type VisiblePerSide = {
  left: SlotContent | null
  right: SlotContent | null
  bottom: SlotContent | null
}

/** 浮出 id(主岛 / 子岛 / 编辑器大陆) */
type FloatingId = ToolWindowId | SubIslandId | EditorDocId

type UiState = ScriptSliceState &
  ScriptSliceActions & {
  // project
  projectPath: string | null
  projectName: string | null
  manifest: ProjectManifest | null

  // workspace(功能即岛 v2:dock 模型)
  workspacePreset: WorkspacePresetId
  /** B2:各预设的用户定制快照(全局,非 per-project) */
  layoutsByPreset: LayoutsByPreset
  /** C1:主编辑面 — 卡片 vs 源码 */
  editorSurface: EditorSurface
  dockSide: Record<ToolWindowId, DockSide>
  visiblePerSide: VisiblePerSide
  activeSubIsland: Record<ToolWindowId, SubIslandId>
  floatingPanels: readonly FloatingId[]
 /** 全项目 merge 后的 AST(预览/Flow/Outline 只读视图) */
 projectMergedAst: ScriptNode | null
 projectParseError: string | null
 selectedCharacterId: string | null
 /** 大纲跳转角色卡:CharacterListPanel 消费后清空 */
 characterEditorTargetId: string | null
 /** P2a:预览面板开关(F5/菜单/dispatcher 统一切换,原为 EditorCore 本地态) */
 previewOpen: boolean
 /** B2:EditorCore react-resizable-panels 分栏比例 */
 editorCoreLayout: EditorCoreLayout

  // UI state
  theme: Theme
 commandPaletteOpen: boolean
 commandPaletteMode: 'all' | 'file'
 preferencesOpen: boolean
  preferencesSection: PreferencesSection
  exportDialogOpen: boolean
  commitDialogOpen: boolean
  newProjectDialogOpen: boolean
  shortcutRecording: boolean
  /** P0:已解析的命令→accelerator 映射(用户覆盖优先,否则默认);键盘 hook 读此 */
  resolvedShortcuts: Partial<Record<string, string>>

  // recent
  recentProjects: RecentProject[]
  selectedNode: SelectedNode

  // actions
  setProject: (projectPath: string, manifest: ProjectManifest) => void
  /** B2:应用预设(快照 outgoing + 恢复 target) */
  applyWorkspacePreset: (preset: WorkspacePresetId) => void
  /** @deprecated 请用 applyWorkspacePreset */
  setWorkspacePreset: (preset: WorkspacePresetId) => void
  setEditorCoreLayout: (layout: Partial<EditorCoreLayout>) => void
  setEditorSurface: (surface: EditorSurface) => void
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
  setFloatingPanels: (panels: readonly FloatingId[]) => void
 setSelectedCharacterId: (id: string | null) => void
 openCharacterFromOutline: (id: string) => void
 clearCharacterEditorTarget: () => void
 setProjectMergedAst: (ast: ScriptNode | null, error?: string | null) => void
 /** P2a:切换预览面板开合(无参=toggle,有参=强制) */
  setPreviewOpen: (open?: boolean) => void
 addFloatingPanel: (panel: FloatingId) => void
  removeFloatingPanel: (panel: FloatingId) => void
  setRecentProjects: (recent: RecentProject[]) => void
  setTheme: (theme: Theme) => void
  setSelectedNode: (node: SelectedNode) => void
 toggleCommandPalette: (open?: boolean) => void
 /** P5b:⌘P = Go to File(以文件模式打开命令面板) */
 openGoToFile: () => void
 openPreferences: (section?: PreferencesSection) => void
  closePreferences: () => void
  openExportDialog: () => void
  closeExportDialog: () => void
  openCommitDialog: () => void
  closeCommitDialog: () => void
  openNewProjectDialog: () => void
  closeNewProjectDialog: () => void
  closeProject: () => void
  /** P5a:ESC 单源关闭 — 按优先级关最上层已开 modal */
  dismissTopModal: () => void
 setShortcutRecording: (recording: boolean) => void
  /** P0:设置已解析快捷键(由 use-keyboard-shortcuts 订阅偏好后灌入) */
  setResolvedShortcuts: (shortcuts: Partial<Record<string, string>>) => void
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
  project: 'assets',
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

export const useUiStore = create<UiState>((set, get) => ({
  ...createScriptSlice(set as never, get as never),
  projectPath: null,
  projectName: null,
  manifest: null,
  workspacePreset: 'writing',
  layoutsByPreset: {},
  editorSurface: 'cards',
  dockSide: { ...DEFAULT_DOCK_SIDE },
  visiblePerSide: { ...DEFAULT_VISIBLE },
  activeSubIsland: { ...DEFAULT_ACTIVE_SUB },
  floatingPanels: [],
  projectMergedAst: null,
  projectParseError: null,
  selectedCharacterId: null,
  characterEditorTargetId: null,
 previewOpen: false,
 editorCoreLayout: { ...DEFAULT_EDITOR_CORE_LAYOUT },
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
 shortcutRecording: false,
 resolvedShortcuts: {},

setProject: (projectPath, manifest) => {
    // 切项目时清空旧项目的打开文件缓存(文件名可能跨项目撞名,避免脏恢复)
    set({
      projectPath,
      manifest,
      projectName: manifest.name,
      projectMergedAst: null,
      projectParseError: null,
      selectedCharacterId: null,
      characterEditorTargetId: null,
      openFiles: [],
      fileCache: {},
      scriptPast: [],
      scriptFuture: []
    })
    // B2:打开项目时恢复全局上次预设布局
    get().applyWorkspacePreset(get().workspacePreset)
  },
  applyWorkspacePreset: (preset) => {
    const s = get()
    const prev = s.workspacePreset
    const layoutsByPreset = { ...s.layoutsByPreset }
    layoutsByPreset[prev] = captureWorkspaceSnapshot(s)
    const snapshot = layoutsByPreset[preset] ?? WORKSPACE_PRESET_DEFAULTS[preset]
    set({
      workspacePreset: preset,
      layoutsByPreset,
      visiblePerSide: { ...snapshot.visiblePerSide },
      activeSubIsland: { ...snapshot.activeSubIsland },
      dockSide: { ...snapshot.dockSide },
      editorCoreLayout: { ...snapshot.editorCoreLayout },
      previewOpen: snapshot.previewOpen
    })
  },

  setWorkspacePreset: (preset) => get().applyWorkspacePreset(preset),

  setEditorCoreLayout: (layout) =>
    set((s) => ({ editorCoreLayout: { ...s.editorCoreLayout, ...layout } })),

  setEditorSurface: (surface) => set({ editorSurface: surface }),

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
  setFloatingPanels: (panels) => set({ floatingPanels: panels }),
  addFloatingPanel: (panel) =>
    set((s) =>
      s.floatingPanels.includes(panel)
        ? s
        : { floatingPanels: [...s.floatingPanels, panel] }
    ),
  removeFloatingPanel: (panel) =>
    set((s) => ({ floatingPanels: s.floatingPanels.filter((p) => p !== panel) })),

 setSelectedCharacterId: (id) => set({ selectedCharacterId: id }),

 openCharacterFromOutline: (id) =>
   set((s) => {
     const side = s.dockSide.character
     return {
       selectedCharacterId: id,
       characterEditorTargetId: id,
       activeSubIsland: { ...s.activeSubIsland, character: 'profiles' },
       visiblePerSide: { ...s.visiblePerSide, [side]: 'character' }
     }
   }),

 clearCharacterEditorTarget: () => set({ characterEditorTargetId: null }),

 setProjectMergedAst: (ast, error = null) =>
   set({ projectMergedAst: ast, projectParseError: error }),
  setPreviewOpen: (open) =>
    set((s) => ({ previewOpen: open !== undefined ? open : !s.previewOpen })),
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
      // 打开时重置为全命令模式(⌘P 走 openGoToFile 单独置 file 模式)
      return next
        ? { commandPaletteOpen: true, commandPaletteMode: 'all' as const }
        : { commandPaletteOpen: false }
    }),
  /** P5b:⌘P = Go to File,以文件模式打开命令面板 */
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
  dismissTopModal: () =>
    set((s) => {
      // 优先级:命令面板 > 导出 > 提交 > 新建项目 > 偏好
      if (s.commandPaletteOpen) return { commandPaletteOpen: false }
      if (s.exportDialogOpen) return { exportDialogOpen: false }
      if (s.commitDialogOpen) return { commitDialogOpen: false }
      if (s.newProjectDialogOpen) return { newProjectDialogOpen: false }
      if (s.preferencesOpen) return { preferencesOpen: false }
      return s
    }),
 closeProject: () =>
  set({
    projectPath: null,
    manifest: null,
    projectName: null,
     activeScriptFile: null,
     selectedNode: null,
     scriptSource: '',
     scriptAst: null,
     projectMergedAst: null,
     projectParseError: null,
     scriptDiagnostics: [],
     scriptDirty: false,
     openFiles: [],
     fileCache: {},
     scriptPast: [],
     scriptFuture: [],
     selectedSceneId: null
  }),
  setShortcutRecording: (recording) => set({ shortcutRecording: recording }),
  setResolvedShortcuts: (shortcuts) => set({ resolvedShortcuts: shortcuts })
}))

/** 剧本编辑态 hook 别名(与 useUiStore 同一 zustand 实例,script-store slice) */
export const useScriptStore = useUiStore

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
