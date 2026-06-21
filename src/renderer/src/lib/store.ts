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
import { parse } from '../../../shared/dsl/parser'
import { serialize } from '../../../shared/dsl/serializer'
import type { ScriptNode, ParseError } from '../../../shared/dsl/types'
import type {
  EditorDocId,
  ToolWindowId,
  SubIslandId,
  PlaceholderId,
  DockSide,
  SlotContent
} from '../components/workspace/mosaic/panel-registry'

export type WorkspacePresetId = 'writing' | 'flow' | 'review'

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

/** P4:卡片撤销历史栈上限(按文件有界) */
const MAX_HISTORY = 50

/** P4:多 tab — 非活跃打开文件的缓存(仅存源串+脏态+撤销栈,激活时再 reparse) */
type FileCacheEntry = {
  source: string
  dirty: boolean
  past: string[]
  future: string[]
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
  floatingPanels: readonly FloatingId[]
 // 编辑核心区(方案 B):单一 AST 真相源 + 场景选中态
 scriptSource: string
 scriptAst: ScriptNode | null
 selectedSceneId: string | null
 scriptDiagnostics: ParseError[]
 scriptDirty: boolean
 /** P2a:预览面板开关(F5/菜单/dispatcher 统一切换,原为 EditorCore 本地态) */
 previewOpen: boolean
 /** 诊断点击跳转:ScriptEditor 消费后清空 */
 scriptEditorScrollTarget: { line: number; column: number } | null

 // P4:多 tab + 卡片撤销(按文件有界历史栈)
 openFiles: string[]
 fileCache: Record<string, FileCacheEntry>
 scriptPast: string[]
 scriptFuture: string[]

 // editor layout (保留兼容)
 layout: EditorLayout

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
  setFloatingPanels: (panels: readonly FloatingId[]) => void
 setSelectedSceneId: (id: string | null) => void
 /** P2a:切换预览面板开合(无参=toggle,有参=强制) */
  setPreviewOpen: (open?: boolean) => void
  setScriptEditorScrollTarget: (target: { line: number; column: number } | null) => void
  /** 读盘后灌入(parse 在此完成),dirty=false */
  loadScriptText: (text: string) => void
  /** 源串编辑(原始编辑器):reparse,dirty=true */
  editScriptSource: (next: string) => void
  /** AST mutator 编辑(卡片):clone+mutate+serialize,dirty=true */
  editScriptAst: (mutator: (ast: ScriptNode) => void) => void
 /** 存盘成功后清 dirty */
 markScriptSaved: () => void
 /** P4:卡片撤销 — 还原上一笔编辑(基于源串快照栈) */
 undo: () => void
 /** P4:卡片重做 */
 redo: () => void
 /** P4:关闭已打开文件 tab(切换到邻居,不丢其余文件脏态) */
 closeScriptFile: (fileName: string) => void
 addFloatingPanel: (panel: FloatingId) => void
  removeFloatingPanel: (panel: FloatingId) => void
  setLayout: (layout: Partial<EditorLayout>) => void
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

/** 把文本 parse 为 {source, ast, diagnostics}(供 loadScriptText / editScriptSource 共用) */
const parseToDoc = (
  text: string
): { scriptSource: string; scriptAst: ScriptNode | null; scriptDiagnostics: ParseError[] } => {
 const result = parse(text)
  if (result.ok !== true) {
    return { scriptSource: text, scriptAst: null, scriptDiagnostics: result.error }
  }
  return { scriptSource: text, scriptAst: result.value, scriptDiagnostics: result.value.errors }
}

export const useUiStore = create<UiState>((set, get) => ({
  projectPath: null,
  projectName: null,
  manifest: null,
  activeScriptFile: 'chapter1.gal',
  workspacePreset: 'writing',
  dockSide: { ...DEFAULT_DOCK_SIDE },
  visiblePerSide: { ...DEFAULT_VISIBLE },
  activeSubIsland: { ...DEFAULT_ACTIVE_SUB },
  floatingPanels: [],
  scriptSource: '',
  scriptAst: null,
  selectedSceneId: null,
 scriptDiagnostics: [],
 scriptDirty: false,
 previewOpen: false,
 scriptEditorScrollTarget: null,
 openFiles: [],
 fileCache: {},
 scriptPast: [],
 scriptFuture: [],
 layout: defaultLayout,
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

setProject: (projectPath, manifest) =>
    // 切项目时清空旧项目的打开文件缓存(文件名可能跨项目撞名,避免脏恢复)
    set({
      projectPath,
      manifest,
      projectName: manifest.name,
      openFiles: [],
      fileCache: {},
      scriptPast: [],
      scriptFuture: []
    }),
  setActiveScript: (fileName) => {
    // null = 无文件可显(全部关闭):重置脚本态
    if (fileName === null) {
      set({
        activeScriptFile: null,
        openFiles: [],
        fileCache: {},
        scriptSource: '',
        scriptAst: null,
        scriptDiagnostics: [],
        scriptDirty: false,
        scriptPast: [],
        scriptFuture: [],
        selectedSceneId: null
      })
      return
    }
    const s = get()
    if (fileName === s.activeScriptFile) {
      if (!s.openFiles.includes(fileName)) set({ openFiles: [...s.openFiles, fileName] })
      return
    }
    // 快照当前活跃文件(源串+脏态+撤销栈)到缓存,供切回时恢复
    const fileCache = { ...s.fileCache }
    if (s.activeScriptFile) {
      fileCache[s.activeScriptFile] = {
        source: s.scriptSource,
        dirty: s.scriptDirty,
        past: s.scriptPast,
        future: s.scriptFuture
      }
    }
    const openFiles = s.openFiles.includes(fileName)
      ? s.openFiles
      : [...s.openFiles, fileName]
    const cached = fileCache[fileName]
    if (cached) {
      // 已缓存(可能脏)→ 恢复到顶层;保留缓存项使 useScriptSync 跳过读盘
      set({
        activeScriptFile: fileName,
        openFiles,
        fileCache,
        ...parseToDoc(cached.source),
        scriptDirty: cached.dirty,
        scriptPast: cached.past,
        scriptFuture: cached.future,
        selectedSceneId: null
      })
    } else {
      // 未缓存 → useScriptSync 从盘载入(loadScriptText 会重置 history)
      set({
        activeScriptFile: fileName,
        openFiles,
        fileCache,
        scriptPast: [],
        scriptFuture: [],
        selectedSceneId: null
      })
    }
  },
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
  setFloatingPanels: (panels) => set({ floatingPanels: panels }),
  addFloatingPanel: (panel) =>
    set((s) =>
      s.floatingPanels.includes(panel)
        ? s
        : { floatingPanels: [...s.floatingPanels, panel] }
    ),
  removeFloatingPanel: (panel) =>
    set((s) => ({ floatingPanels: s.floatingPanels.filter((p) => p !== panel) })),
 setSelectedSceneId: (id) => set({ selectedSceneId: id }),
  setPreviewOpen: (open) =>
    set((s) => ({ previewOpen: open !== undefined ? open : !s.previewOpen })),
  setScriptEditorScrollTarget: (target) => set({ scriptEditorScrollTarget: target }),
  loadScriptText: (text) =>
    // 读盘载入(全新内容)→ 重置撤销栈(不可 undo 过载入点)
    set({ ...parseToDoc(text), scriptDirty: false, scriptPast: [], scriptFuture: [] }),
  editScriptSource: (next) =>
    // 源串编辑(原始编辑器 / AI 落地):reparse+dirty;清 future(新编辑使重做失效),
    // 不入 past(原始编辑器走 CodeMirror 自身撤销,避免每键一条历史)
    set({ ...parseToDoc(next), scriptDirty: true, scriptFuture: [] }),
  editScriptAst: (mutator) => {
    const ast = get().scriptAst
    if (!ast) return
    const prev = get().scriptSource
    const clone = structuredClone(ast) as ScriptNode
    mutator(clone)
    set({
      scriptAst: clone,
      scriptSource: serialize(clone),
      scriptDiagnostics: clone.errors,
      scriptDirty: true,
      // commit 前 push 旧源串;卡片与原始编辑器共享此栈
      scriptPast: [...get().scriptPast, prev].slice(-MAX_HISTORY),
      scriptFuture: []
    })
  },
  markScriptSaved: () => set({ scriptDirty: false }),
  undo: () => {
    const s = get()
    if (s.scriptPast.length === 0) return
    const past = [...s.scriptPast]
    const prev = past.pop() as string
    set({
      ...parseToDoc(prev),
      scriptDirty: true,
      scriptPast: past,
      scriptFuture: [s.scriptSource, ...s.scriptFuture].slice(0, MAX_HISTORY)
    })
  },
  redo: () => {
    const s = get()
    if (s.scriptFuture.length === 0) return
    const future = [...s.scriptFuture]
    const next = future.shift() as string
    set({
      ...parseToDoc(next),
      scriptDirty: true,
      scriptPast: [...s.scriptPast, s.scriptSource].slice(-MAX_HISTORY),
      scriptFuture: future
    })
  },
  closeScriptFile: (fileName) => {
    const s = get()
    const openFiles = s.openFiles.filter((f) => f !== fileName)
    const fileCache = { ...s.fileCache }
    delete fileCache[fileName]
    // 关闭非活跃文件:仅从 tab/缓存移除
    if (s.activeScriptFile !== fileName) {
      set({ openFiles, fileCache })
      return
    }
    // 关闭活跃文件:切到邻居(不快照被关文件),邻居必在缓存中
    const idx = s.openFiles.indexOf(fileName)
    const neighbor = openFiles[idx] ?? openFiles[idx - 1] ?? null
    if (neighbor === null) {
      set({
        openFiles: [],
        fileCache: {},
        activeScriptFile: null,
        scriptSource: '',
        scriptAst: null,
        scriptDiagnostics: [],
        scriptDirty: false,
        scriptPast: [],
        scriptFuture: [],
        selectedSceneId: null
      })
      return
    }
    const cached = fileCache[neighbor]
    if (cached) {
      set({
        activeScriptFile: neighbor,
        openFiles,
        fileCache,
        ...parseToDoc(cached.source),
        scriptDirty: cached.dirty,
        scriptPast: cached.past,
        scriptFuture: cached.future,
        selectedSceneId: null
      })
    } else {
      set({
        activeScriptFile: neighbor,
        openFiles,
        fileCache,
        scriptPast: [],
        scriptFuture: [],
        selectedSceneId: null
      })
    }
  },
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
