/**
 * Panel Registry — 可被 mosaic/floating 装载的 panel 元数据
 *
 * 设计:
 *   - 每个 panel 用 string id 标识(共 5 个)
 *   - 包含 title / icon / component 引用
 *   - 渲染时通过 id 查 component
 *   - mosaic 树用 id 字符串作为叶子节点
 *
 * PR3-A 扩展:
 *   - 加 'left-tool-window' / 'ai-tool-window' 两个 ToolWindow
 *   - ToolWindow 也支持浮出(独立 BrowserWindow)
 *   - 中区三 panel + 两个 ToolWindow = 共 5 个,共浮出数限制 3(防误操作)
 *   - 浮出时主窗口相应槽位隐藏(避免双渲染)
 */
import type { ComponentType } from 'react'
import { FileText, GitBranch, Box, Folder, Sparkles } from 'lucide-react'
import { ScriptEditor } from '../../../features/script-editor/ScriptEditor'
import { FlowView } from '../../../features/flow-view/FlowView'
import { PreviewCanvas } from '../../../features/preview/PreviewCanvas'
import { LeftToolWindow } from '../LeftToolWindow'
import { AiToolWindow } from '../AiToolWindow'

export type PanelId =
  | 'script-editor'
  | 'flow-view'
  | 'preview-canvas'
  | 'left-tool-window'
  | 'ai-tool-window'

export type PanelLocation = 'left' | 'center' | 'right'

export type PanelMeta = {
  id: PanelId
  title: string
  icon: ComponentType<{ className?: string }>
  /** 缺省位置 — left(center 中区) / right(右侧 AI) / center(中区分栏) */
  defaultLocation: PanelLocation
}

export const PANEL_META: Record<PanelId, PanelMeta> = {
  'script-editor': {
    id: 'script-editor',
    title: '剧本',
    icon: FileText,
    defaultLocation: 'center'
  },
  'flow-view': {
    id: 'flow-view',
    title: '流程图',
    icon: GitBranch,
    defaultLocation: 'center'
  },
  'preview-canvas': {
    id: 'preview-canvas',
    title: '预览',
    icon: Box,
    defaultLocation: 'center'
  },
  'left-tool-window': {
    id: 'left-tool-window',
    title: '项目',
    icon: Folder,
    defaultLocation: 'left'
  },
  'ai-tool-window': {
    id: 'ai-tool-window',
    title: 'AI 助手',
    icon: Sparkles,
    defaultLocation: 'right'
  }
}

/** 根据 panel id 拿 component */
export const getPanelComponent = (id: PanelId): ComponentType => {
  switch (id) {
    case 'script-editor':
      return ScriptEditor
    case 'flow-view':
      return FlowView
    case 'preview-canvas':
      return PreviewCanvas
    case 'left-tool-window':
      return LeftToolWindow
    case 'ai-tool-window':
      return AiToolWindow
  }
}

export const ALL_PANEL_IDS: readonly PanelId[] = [
  'script-editor',
  'flow-view',
  'preview-canvas',
  'left-tool-window',
  'ai-tool-window'
]

/**
 * Mosaic 中区可用 panel(只中区三 panel,ToolWindow 不进 mosaic 树)
 * 浮出仍可用 ALL_PANEL_IDS(独立 BrowserWindow 渲染)
 */
export const MOSAIC_PANEL_IDS: readonly PanelId[] = [
  'script-editor',
  'flow-view',
  'preview-canvas'
]

/** 判断 panel 是否是 ToolWindow(浮出时主窗口相应槽位隐藏) */
export const isToolWindow = (id: PanelId): id is 'left-tool-window' | 'ai-tool-window' =>
  id === 'left-tool-window' || id === 'ai-tool-window'
