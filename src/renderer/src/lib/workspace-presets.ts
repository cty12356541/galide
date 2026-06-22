/**
 * workspace-presets — 工作区预设 declarative 默认布局(B2)
 *
 * 三个预设(写作 / 流程 / 评审)各含 dock 可见性、子岛 tab、EditorCore 分栏比例、预览开关。
 * applyWorkspacePreset 在 store 内做 per-preset 快照往返;本模块只提供默认值与类型。
 */
import type { ToolWindowId, SubIslandId, DockSide, SlotContent } from '../components/workspace/mosaic/panel-registry'

export type WorkspacePresetId = 'writing' | 'flow' | 'review'

export interface EditorCoreLayout {
  /** 水平:左列贯通(对话卡) | 右列(场景+流程) */
  beat: number
  right: number
  /** 预览关:右列上下(场景轨 / 决策树);预览开:品字顶行左右 */
  sceneRail: number
  flow: number
  /** 预览展开时,右列垂直:顶行(场景+流程) | 预览底格 */
  centerRow: number
  preview: number
}

/** 主区三槽分栏(左 project | 大陆 EditorCore | 右 AI),对齐默认写作截图 */
export interface CenterSplitLayout {
  left: number
  centerWithBoth: number
  centerLeftOnly: number
  centerRightOnly: number
  right: number
  bottomMain: number
  bottomPanel: number
}

/** 写作初始截图(2026-06-22):左资产岛 + 对话主列 + 场景/流程叠放 + 右 AI */
export const WRITING_CENTER_SPLIT: CenterSplitLayout = {
  left: 18,
  centerWithBoth: 58,
  centerLeftOnly: 82,
  centerRightOnly: 76,
  right: 24,
  bottomMain: 72,
  bottomPanel: 28
}

export const DEFAULT_CENTER_SPLIT: CenterSplitLayout = { ...WRITING_CENTER_SPLIT }

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

/** 写作 EditorCore:左列 ~70%,右列场景轨上 / 流程下;展开预览时品字四格 */
const WRITING_LAYOUT: EditorCoreLayout = {
  beat: 70,
  right: 30,
  sceneRail: 30,
  flow: 70,
  centerRow: 56,
  preview: 44
}

/** 流程:左 outline、AI 隐藏;右列加宽,决策树放大 */
const FLOW_LAYOUT: EditorCoreLayout = {
  beat: 40,
  right: 60,
  sceneRail: 22,
  flow: 78,
  centerRow: 55,
  preview: 45
}

/** 评审:左 git、预览底格大开、AI 收到底栏 */
const REVIEW_LAYOUT: EditorCoreLayout = {
  beat: 55,
  right: 45,
  sceneRail: 50,
  flow: 50,
  centerRow: 34,
  preview: 66
}

export const DEFAULT_EDITOR_CORE_LAYOUT: EditorCoreLayout = { ...WRITING_LAYOUT }

export const WORKSPACE_PRESET_DEFAULTS: Record<WorkspacePresetId, WorkspacePresetSnapshot> = {
  writing: {
    visiblePerSide: { left: 'project', right: 'ai', bottom: null },
    activeSubIsland: { ...BASE_SUB, project: 'assets' },
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
