/**
 * workspace-presets — 工作区预设 declarative 默认布局(B2)
 *
 * 三个预设(写作 / 流程 / 评审)各含 dock 可见性、子岛 tab、EditorCore 分栏比例、预览开关。
 * applyWorkspacePreset 在 store 内做 per-preset 快照往返;本模块只提供默认值与类型。
 */
import type { ToolWindowId, SubIslandId, DockSide, SlotContent } from '../components/workspace/mosaic/panel-registry'

export type WorkspacePresetId = 'writing' | 'flow' | 'review'

export interface EditorCoreLayout {
  /** 水平:对话卡 | 右列(场景轨+决策树) */
  beat: number
  right: number
  /** 右列垂直:场景轨 | 决策树 */
  sceneRail: number
  flow: number
  /** 预览展开时垂直:主编辑行 | 预览 */
  centerRow: number
  preview: number
}

export interface WorkspacePresetSnapshot {
  visiblePerSide: { left: SlotContent | null; right: SlotContent | null; bottom: SlotContent | null }
  activeSubIsland: Record<ToolWindowId, SubIslandId>
  dockSide: Record<ToolWindowId, DockSide>
  editorCoreLayout: EditorCoreLayout
  previewOpen: boolean
}

export type LayoutsByPreset = Partial<Record<WorkspacePresetId, WorkspacePresetSnapshot>>

const BASE_DOCK: Record<ToolWindowId, DockSide> = {
  project: 'left',
  git: 'left',
  outline: 'left',
  character: 'left',
  ai: 'right'
}

const BASE_SUB: Record<ToolWindowId, SubIslandId> = {
  project: 'scripts',
  git: 'git',
  outline: 'outline',
  character: 'profiles',
  ai: 'ai'
}

/** 写作:左 project(scripts)、右 AI、预览关、对话卡占主区 */
const WRITING_LAYOUT: EditorCoreLayout = {
  beat: 72,
  right: 28,
  sceneRail: 35,
  flow: 65,
  centerRow: 100,
  preview: 32
}

/** 流程:左 outline、AI 隐藏、决策树放大、预览关 */
const FLOW_LAYOUT: EditorCoreLayout = {
  beat: 40,
  right: 60,
  sceneRail: 22,
  flow: 78,
  centerRow: 100,
  preview: 32
}

/** 评审:左 git、预览大开、AI 收到底栏 */
const REVIEW_LAYOUT: EditorCoreLayout = {
  beat: 55,
  right: 45,
  sceneRail: 28,
  flow: 72,
  centerRow: 38,
  preview: 62
}

export const DEFAULT_EDITOR_CORE_LAYOUT: EditorCoreLayout = { ...WRITING_LAYOUT }

export const WORKSPACE_PRESET_DEFAULTS: Record<WorkspacePresetId, WorkspacePresetSnapshot> = {
  writing: {
    visiblePerSide: { left: 'project', right: 'ai', bottom: null },
    activeSubIsland: { ...BASE_SUB, project: 'scripts' },
    dockSide: { ...BASE_DOCK },
    editorCoreLayout: WRITING_LAYOUT,
    previewOpen: false
  },
  flow: {
    visiblePerSide: { left: 'outline', right: null, bottom: null },
    activeSubIsland: { ...BASE_SUB, outline: 'outline' },
    dockSide: { ...BASE_DOCK },
    editorCoreLayout: FLOW_LAYOUT,
    previewOpen: false
  },
  review: {
    visiblePerSide: { left: 'git', right: null, bottom: 'ai' },
    activeSubIsland: { ...BASE_SUB, git: 'git' },
    dockSide: { ...BASE_DOCK, ai: 'bottom' },
    editorCoreLayout: REVIEW_LAYOUT,
    previewOpen: true
  }
}

/** 从 store 当前态截取可持久化快照 */
export const captureWorkspaceSnapshot = (state: {
  visiblePerSide: WorkspacePresetSnapshot['visiblePerSide']
  activeSubIsland: Record<ToolWindowId, SubIslandId>
  dockSide: Record<ToolWindowId, DockSide>
  editorCoreLayout: EditorCoreLayout
  previewOpen: boolean
}): WorkspacePresetSnapshot => ({
  visiblePerSide: { ...state.visiblePerSide },
  activeSubIsland: { ...state.activeSubIsland },
  dockSide: { ...state.dockSide },
  editorCoreLayout: { ...state.editorCoreLayout },
  previewOpen: state.previewOpen
})
