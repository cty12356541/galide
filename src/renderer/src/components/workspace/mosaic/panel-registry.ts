/**
 * Panel Registry — 中区可被 mosaic/floating 装载的 panel 元数据
 *
 * 设计:
 *   - 每个 panel 用 string id 标识(ScriptEditor / FlowView / Preview)
 *   - 包含 title / icon / component 引用
 *   - 渲染时通过 id 查 component
 *   - mosaic 树用 id 字符串作为叶子节点
 *   - PR2 范围:仅 mosaic 化"中区"(script / flow / preview),ToolWindow 走 react-resizable-panels
 */
import type { ComponentType } from 'react'
import { FileText, GitBranch, Box } from 'lucide-react'
import { ScriptEditor } from '../../../features/script-editor/ScriptEditor'
import { FlowView } from '../../../features/flow-view/FlowView'
import { PreviewCanvas } from '../../../features/preview/PreviewCanvas'

export type PanelId = 'script-editor' | 'flow-view' | 'preview-canvas'

export type PanelMeta = {
  id: PanelId
  title: string
  icon: ComponentType<{ className?: string }>
  /** 缺省位置 — preset 决定,目前只用于 mosaic 内部排序 */
  defaultLocation: 'center'
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
  }
}

/** 根据 panel id 拿 component(用于 mosaic render,仅中区三 panel) */
export const getPanelComponent = (id: PanelId): ComponentType => {
  switch (id) {
    case 'script-editor':
      return ScriptEditor
    case 'flow-view':
      return FlowView
    case 'preview-canvas':
      return PreviewCanvas
  }
}

export const ALL_PANEL_IDS: readonly PanelId[] = ['script-editor', 'flow-view', 'preview-canvas']
