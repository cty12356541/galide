import { cn } from '../../lib/utils'

const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element => {
  return (
    <div
      data-testid="skeleton"
      className={cn('animate-pulse rounded-md bg-bg-elevated', className)}
      {...props}
    />
  )
}

/** 面板级加载占位:header 条 + 若干文本行,逼近最终列表布局 */
const PanelSkeleton = ({
  lines = 4,
  className
}: {
  lines?: number
  className?: string
}): JSX.Element => (
  <div
    aria-busy="true"
    aria-label="加载中"
    className={cn('h-full w-full p-3 space-y-2', className)}
  >
    <Skeleton className="h-6 w-1/3" />
    {Array.from({ length: lines }, (_, i) => (
      <Skeleton key={i} className={cn('h-3.5', i % 3 === 2 ? 'w-2/3' : 'w-full')} />
    ))}
  </div>
)

/** 表单/偏好页加载占位:标题区 + label/control 行,逼近 PreferenceEditor 布局 */
const FormSkeleton = ({
  rows = 4,
  className
}: {
  rows?: number
  className?: string
}): JSX.Element => (
  <div aria-busy="true" aria-label="加载中" className={cn('space-y-6 max-w-3xl', className)}>
    <div className="space-y-2">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-4 w-56" />
    </div>
    <div className="border border-border rounded-2xl p-4 bg-surface space-y-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  </div>
)

export { Skeleton, PanelSkeleton, FormSkeleton }
