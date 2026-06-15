/**
 * ScriptListPanel — SidePanel 的 scripts 面板
 *
 * 内容:复用现有 ScriptFileTree 组件(features/script-editor/ScriptFileTree.tsx),
 * 套一层 panel chrome(标题栏 + 高度限制),与 SidePanel 的统一布局对齐。
 *
 * 为什么是 wrapper 而非直接 import:
 *  - 规约 Rule 1 一个 panel = 一个 feature。ScriptFileTree 内部已经独立实现了
 *    剧本 CRUD UI;本组件只负责"它是 SidePanel 里 6 个 panel 中的一个"。
 *  - SidePanel 用 PanelFor dict 做泛型渲染,本组件必须导出 React 组件而非纯 utility。
 */

import { FileText } from 'lucide-react'
import { ScrollArea } from '../../components/ui/scroll-area'
import { ScriptFileTree } from './ScriptFileTree'

export const ScriptListPanel = (): JSX.Element => {
  return (
    <div className="h-full flex flex-col bg-surface border-r border-border">
      <div className="h-10 px-3 flex items-center gap-2 border-b border-border">
        <FileText className="w-4 h-4 text-text-muted" />
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">剧本</span>
      </div>
      <ScrollArea className="flex-1">
        <ScriptFileTree />
      </ScrollArea>
    </div>
  )
}