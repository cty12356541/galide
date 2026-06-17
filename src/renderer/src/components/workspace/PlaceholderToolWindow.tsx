/**
 * PlaceholderToolWindow — 通用占位 Tool Window
 *
 * 用于未实现的功能(搜索/调试/设置),保持布局稳定,后续 P8+ 接通具体功能时直接替换。
 */
import type { LucideIcon } from 'lucide-react'
import { Construction } from 'lucide-react'

export const PlaceholderToolWindow = ({
  icon: Icon,
  title,
  description
}: {
  icon?: LucideIcon
  title: string
  description: string
}): JSX.Element => {
  const FinalIcon = Icon ?? Construction
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center bg-canvas gap-3 text-text-muted p-6"
      data-testid={`placeholder-tool-window-${title}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-bg-elevated border border-border flex items-center justify-center">
        <FinalIcon className="w-7 h-7 opacity-40" />
      </div>
      <div className="text-sm font-medium text-text">{title}</div>
      <div className="text-xs text-text-muted text-center max-w-[200px]">{description}</div>
      <div className="text-[10px] text-text-muted opacity-60 mt-1 uppercase tracking-wider">
        即将支持
      </div>
    </div>
  )
}
