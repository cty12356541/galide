/**
 * ProjectTabs — 已打开文件 tab 列表
 *
 * 设计:
 *   - 显示当前 activeScriptFile(简化为单 tab,后续 P2 多 tab)
 *   - 现在 P1: 仅显示当前文件路径 + workspace preset 标签
 *   - 后续 P2: 引入 react-tabs 支持多文件 tab + 拖拽重排
 */
import { FileText } from 'lucide-react'
import { useUiStore } from '../lib/store'
import { cn } from '../lib/utils'

export const ProjectTabs = (): JSX.Element => {
  const activeScript = useUiStore((s) => s.activeScriptFile)
  const workspacePreset = useUiStore((s) => s.workspacePreset)

  // 无 active script → 0 高度占位 strip,避免 main 区域高度跳动
  if (!activeScript) {
    return <div className="h-0 flex-shrink-0" data-testid="project-tabs-empty" aria-hidden />
  }

  return (
    <div
      className="h-8 bg-bg-elevated border-b border-border flex items-center px-2.5 gap-1 flex-shrink-0"
      data-testid="project-tabs"
    >
      <button
        type="button"
        className={cn(
          'h-7 px-3 rounded-md text-[13px] font-medium flex items-center gap-1.5 transition-colors',
          'bg-surface text-text border border-border'
        )}
        data-testid="project-tab-active"
      >
        <FileText className="w-3.5 h-3.5" />
        <span>{activeScript}</span>
        <span className="ml-1 px-1.5 rounded bg-bg text-text-muted text-[10px] font-medium uppercase tracking-wider">
          {workspacePreset}
        </span>
      </button>
      <div className="flex-1" />
    </div>
  )
}
