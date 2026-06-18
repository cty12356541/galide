/**
 * Panel Registry — 功能模块即岛
 *
 * 设计(PyCharm 风格,一个功能模块一个岛):
 *   - 每个 feature 是一个独立岛,用 string id 标识(共 10 个)
 *   - 包含 title / icon / component 引用 / 缺省 dock 位置
 *   - 任意岛可浮出为独立 BrowserWindow,关闭后回原 dock 位
 *   - 中区三岛(script/flow/preview)进 mosaic 树可同屏多显
 *   - 侧边岛(left)同一时刻左槽只显示一个(ActivityBar 单选)
 *
 * 浮出上限 5(防误操作刷屏)。
 */
import type { ComponentType } from 'react'
import { FileText, GitBranch, Box, Folder, Sparkles, ListTree, Users, Mic, Image } from 'lucide-react'
import { ScriptEditor } from '../../../features/script-editor/ScriptEditor'
import { FlowView } from '../../../features/flow-view/FlowView'
import { PreviewCanvas } from '../../../features/preview/PreviewCanvas'
import { AiToolWindow } from '../AiToolWindow'
import { ScriptFileTree } from '../../../features/script-editor/ScriptFileTree'
import { GitPanel } from '../../../features/git/GitPanel'
import { OutlinePanel } from '../../../features/outline/OutlinePanel'
import { CharacterListPanel } from '../../../features/character/CharacterListPanel'
import { VoicePanel } from '../../../features/voice/VoicePanel'
import { AssetListPanel } from '../../../features/asset/AssetListPanel'

export type PanelId =
  | 'script-editor'
  | 'flow-view'
  | 'preview-canvas'
  | 'ai-tool-window'
  | 'project'
  | 'git'
  | 'outline'
  | 'character'
  | 'voice'
  | 'asset'

export type PanelLocation = 'left' | 'center' | 'right'

export type PanelMeta = {
  id: PanelId
  title: string
  icon: ComponentType<{ className?: string }>
  /** 缺省位置 — left(center 中区) / right(右侧 AI) / center(中区分栏) */
  defaultLocation: PanelLocation
}

export const PANEL_META: Record<PanelId, PanelMeta> = {
  'script-editor': { id: 'script-editor', title: '剧本', icon: FileText, defaultLocation: 'center' },
  'flow-view': { id: 'flow-view', title: '流程图', icon: GitBranch, defaultLocation: 'center' },
  'preview-canvas': { id: 'preview-canvas', title: '预览', icon: Box, defaultLocation: 'center' },
  'ai-tool-window': { id: 'ai-tool-window', title: 'AI 助手', icon: Sparkles, defaultLocation: 'right' },
  project: { id: 'project', title: '项目', icon: Folder, defaultLocation: 'left' },
  git: { id: 'git', title: 'Git', icon: GitBranch, defaultLocation: 'left' },
  outline: { id: 'outline', title: '大纲', icon: ListTree, defaultLocation: 'left' },
  character: { id: 'character', title: '角色', icon: Users, defaultLocation: 'left' },
  voice: { id: 'voice', title: '语音', icon: Mic, defaultLocation: 'left' },
  asset: { id: 'asset', title: '资产', icon: Image, defaultLocation: 'left' }
}

/** 根据 panel id 拿 component(浮出窗口与 docked 共用) */
export const getPanelComponent = (id: PanelId): ComponentType => {
  switch (id) {
    case 'script-editor':
      return ScriptEditor
    case 'flow-view':
      return FlowView
    case 'preview-canvas':
      return PreviewCanvas
    case 'ai-tool-window':
      return AiToolWindow
    case 'project':
      return ScriptFileTree
    case 'git':
      return GitPanel
    case 'outline':
      return OutlinePanel
    case 'character':
      return CharacterListPanel
    case 'voice':
      return VoicePanel
    case 'asset':
      return AssetListPanel
  }
}

export const ALL_PANEL_IDS: readonly PanelId[] = [
  'script-editor',
  'flow-view',
  'preview-canvas',
  'ai-tool-window',
  'project',
  'git',
  'outline',
  'character',
  'voice',
  'asset'
]

/**
 * Mosaic 中区可用 panel(只中区三 panel,侧边岛不进 mosaic 树)
 * 浮出仍可用 ALL_PANEL_IDS(独立 BrowserWindow 渲染)
 */
export const MOSAIC_PANEL_IDS: readonly PanelId[] = [
  'script-editor',
  'flow-view',
  'preview-canvas'
]

/** 侧边岛(left 槽位,由 ActivityBar 单选切换) */
export const SIDE_PANEL_IDS: readonly PanelId[] = [
  'project',
  'git',
  'outline',
  'character',
  'voice',
  'asset'
]

/** 判断 panel 是否是 ToolWindow(浮出时主窗口相应槽位隐藏) */
export const isToolWindow = (id: PanelId): boolean =>
  id === 'ai-tool-window' || SIDE_PANEL_IDS.includes(id)

/** 判断 panel 是否是侧边岛(左槽) */
export const isSidePanel = (id: PanelId): boolean => SIDE_PANEL_IDS.includes(id)
