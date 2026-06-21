/**
 * ActivityBar — PyCharm 风格左侧 Activity Bar(功能即岛 v2)
 *
 * 列出 5 个真实主岛;search/debug 占位已隐藏;设置直接打开偏好(无死胡同)。
 */
import { Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useUiStore } from '../../lib/store'
import { cn } from '../../lib/utils'
import { TOOL_WINDOWS, type ToolWindowId } from './mosaic/panel-registry'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'

type ActivityItem =
  | { kind: 'tw'; id: ToolWindowId; icon: LucideIcon; label: string }
  | { kind: 'settings'; icon: LucideIcon; label: string }

const ITEMS: readonly ActivityItem[] = [
  ...TOOL_WINDOWS.map((t) => ({ kind: 'tw' as const, id: t.id, icon: t.icon, label: t.title })),
  { kind: 'settings', icon: Settings, label: '设置' }
]

export const ActivityBar = (): JSX.Element => {
  const visiblePerSide = useUiStore((s) => s.visiblePerSide)
  const dockSide = useUiStore((s) => s.dockSide)
  const showToolWindow = useUiStore((s) => s.showToolWindow)
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel)
  const openPreferences = useUiStore((s) => s.openPreferences)

  const isItemActive = (item: ActivityItem): boolean => {
    if (item.kind === 'tw') {
      const side = dockSide[item.id]
      return visiblePerSide[side] === item.id
    }
    return false
  }

  return (
    <TooltipProvider delayDuration={300}>
      <nav
        aria-label="Activity Bar"
        className="w-12 h-full bg-bg-elevated border-r border-border flex flex-col items-center py-2 gap-1 flex-shrink-0"
        data-testid="activity-bar"
      >
        {ITEMS.map((item) => {
          const isActive = isItemActive(item)
          const Icon = item.icon
          const side = item.kind === 'tw' ? dockSide[item.id] : 'left'
          const testId = item.kind === 'tw' ? `activity-${item.id}` : 'activity-settings'
          return (
            <Tooltip key={testId}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    if (item.kind === 'settings') {
                      openPreferences()
                      return
                    }
                    if (!isActive) {
                      showToolWindow(item.id)
                    } else {
                      toggleLeftPanel()
                    }
                  }}
                  aria-label={item.label}
                  aria-pressed={isActive}
                  data-testid={testId}
                  className={cn(
                    'relative w-9 h-9 rounded-md flex items-center justify-center transition-colors',
                    isActive
                      ? 'bg-accent-soft text-accent'
                      : 'text-text-muted hover:text-text hover:bg-surface',
                    isActive &&
                      'after:absolute after:left-[-1px] after:top-2 after:bottom-2 after:w-0.5 after:bg-accent after:rounded-full'
                  )}
                >
                  <Icon className="w-[18px] h-[18px]" />
                  {item.kind === 'tw' && side !== 'left' ? (
                    <span
                      className={cn(
                        'absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full',
                        side === 'right' ? 'bg-accent' : 'bg-warning'
                      )}
                      title={`已停靠 ${side === 'right' ? '右侧' : '底部'}`}
                    />
                  ) : null}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {item.label}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </nav>
    </TooltipProvider>
  )
}
