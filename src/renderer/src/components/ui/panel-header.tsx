/**
 * PanelHeader — Panel/子面板统一 header(v0.5 视觉规约)
 *
 * 收敛 5+ 处 h-9/h-10 头部分散重复,统一视觉:
 *   - 三档高度由 size 控制: 'sm' (h-8 子头) | 'md' (h-9 主头,默认) | 'lg' (h-10 带表单/筛选)
 *   - 标题统一 `text-[11px] font-medium uppercase tracking-wider text-text-muted`
 *   - 左侧可放 icon (LucideIcon 类型),右槽 actions 走 ReactNode
 *
 * 用法:
 *   <PanelHeader title="Git" icon={GitBranch} actions={<RefreshButton />} />
 *   <PanelHeader title="场景" subtitle="12" size="sm" />
 */
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

type Size = 'sm' | 'md' | 'lg'

const sizeClass: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[11px] gap-1.5',
  md: 'h-9 px-3 text-[11px] gap-1.5',
  lg: 'h-10 px-3 text-xs gap-2'
}

export const PanelHeader = ({
  title,
  subtitle,
  icon: Icon,
  actions,
  size = 'md',
  className
}: {
  title: string
  subtitle?: string | number
  icon?: LucideIcon
  actions?: ReactNode
  size?: Size
  className?: string
}): JSX.Element => {
  return (
    <header
      className={cn(
        'flex items-center bg-surface border-b border-border flex-shrink-0',
        sizeClass[size],
        className
      )}
      data-testid={`panel-header-${title}`}
    >
      {Icon ? <Icon className="w-3.5 h-3.5 text-text-muted" /> : null}
      <span className="font-medium text-text-muted uppercase tracking-wider">{title}</span>
      {subtitle !== undefined ? (
        <span className="text-text-muted font-normal normal-case tracking-normal">({subtitle})</span>
      ) : null}
      <div className="flex-1" />
      {actions}
    </header>
  )
}
