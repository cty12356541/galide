/**
 * EmptyState — 统一空态组件(v0.5)
 *
 * 视觉规约:
 *   - 中心图标 + 标题 + 副标题 + 可选 action
 *   - 图标 12×12 圆角方形 accent-soft 底,配 accent 图标
 *   - 标题 text-sm font-medium,副标题 text-xs text-text-muted
 *
 * 治本替换 4+ 处空态分散重复(OutlinePanel / VoicePanel / AssetListPanel / WelcomeScreen 子区)
 */
import type { LucideIcon } from 'lucide-react'
import type { ReactNode, HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type Props = {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
  /** 透传 data-testid(测试期望 'outline-panel' 之类的稳定 id) */
  'data-testid'?: string
} & Omit<HTMLAttributes<HTMLDivElement>, 'title'>

export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  className,
  'data-testid': testId,
  ...rest
}: Props): JSX.Element => {
  return (
    <div
      {...rest}
      className={cn(
        'flex-1 flex flex-col items-center justify-center gap-2.5 p-6 text-text-muted',
        className
      )}
      data-testid={testId ?? `empty-state-${title}`}
    >
      {Icon ? (
        <div className="w-12 h-12 rounded-2xl bg-accent-soft border border-border flex items-center justify-center">
          <Icon className="w-5 h-5 text-accent" />
        </div>
      ) : null}
      <div className="text-sm font-medium text-text text-center">{title}</div>
      {description ? (
        <div className="text-xs text-text-muted text-center max-w-[240px] leading-relaxed">
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
