/**
 * WorkspacePresetSelector — TitleBar 第三行的预设切换器
 *
 * 规约 Rule 4: Workspace 切换是原子事务。点击 preset 走 useUiStore.applyWorkspacePreset,
 * store 内部一次写入 activity / tabs / dock 三组状态。
 *
 * 行为:
 *  - 显示当前 preset(writing / flow / review)
 *  - 点击展开 popover(简化为 inline 按钮组),选另一个 preset
 *  - 触发 applyWorkspacePreset 后,store 立即同步 → workspaceLayout 变化 → SidePanel /
 *    DockviewCenterTabs / StatusBarWorkspaceIndicator 自动跟随
 *
 * 简化实现:
 *  - 不引入 popover 组件依赖,直接渲染 3 个按钮的 row
 *  - 视觉紧凑,与 TitleBar 高度对齐
 */

import { ChevronDown, Pencil, Workflow, Eye } from 'lucide-react'
import { useUiStore } from '../../lib/store'
import type { WorkspacePresetId } from '../../lib/workspace-layout'
import { cn } from '../../lib/utils'

const PRESETS: Array<{
  id: WorkspacePresetId
  label: string
  icon: typeof Pencil
}> = [
  { id: 'writing', label: '写作', icon: Pencil },
  { id: 'flow', label: '流程', icon: Workflow },
  { id: 'review', label: '评审', icon: Eye }
]

export const WorkspacePresetSelector = (): JSX.Element => {
  const preset = useUiStore((s) => s.workspaceLayout.preset)
  const applyWorkspacePreset = useUiStore((s) => s.applyWorkspacePreset)

  return (
    <div
      className="flex items-center gap-0.5 mr-1 px-1 py-0.5 rounded-md bg-bg-elevated/50"
      role="group"
      aria-label="Workspace 预设"
      data-testid="workspace-preset-selector"
    >
      <ChevronDown className="w-3 h-3 text-text-muted ml-0.5" aria-hidden />
      {PRESETS.map((p) => {
        const Icon = p.icon
        const isActive = p.id === preset
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => applyWorkspacePreset(p.id)}
            aria-pressed={isActive}
            title={`切换到 ${p.label} 预设`}
            data-testid={`preset-${p.id}`}
            className={cn(
              'h-7 px-2 rounded text-[11px] flex items-center gap-1 transition-colors',
              isActive
                ? 'bg-accent text-white shadow-sm'
                : 'text-text-muted hover:text-text hover:bg-bg'
            )}
          >
            <Icon className="w-3 h-3" />
            {p.label}
          </button>
        )
      })}
    </div>
  )
}