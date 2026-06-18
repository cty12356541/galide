/**
 * ActivityBar — PyCharm 风格左侧 Activity Bar(功能即岛 v2)
 *
 * 列出 5 个真实主岛 + 3 个占位(search/debug/settings)。
 * 点击主岛 → showToolWindow(置其 dockSide 侧可见);点击占位 → showPlaceholder(左槽)。
 * active 高亮 = 该主岛是其 dockSide 侧的可见内容。图标右下角小角标指示 dockSide(右/底)。
 */
import { Search, Bug, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useUiStore } from '../../lib/store'
import { cn } from '../../lib/utils'
import {
  TOOL_WINDOWS,
  type ToolWindowId,
  type PlaceholderId
} from './mosaic/panel-registry'

type ActivityItem =
  | { kind: 'tw'; id: ToolWindowId; icon: LucideIcon; label: string }
  | { kind: 'placeholder'; id: PlaceholderId; icon: LucideIcon; label: string }

const PLACEHOLDER_ITEMS: { id: PlaceholderId; icon: LucideIcon; label: string }[] = [
  { id: 'search', icon: Search, label: '搜索' },
  { id: 'debug', icon: Bug, label: '调试' },
  { id: 'settings', icon: Settings, label: '设置' }
]

const ITEMS: readonly ActivityItem[] = [
  ...TOOL_WINDOWS.map((t) => ({ kind: 'tw' as const, id: t.id, icon: t.icon, label: t.title })),
  ...PLACEHOLDER_ITEMS.map((p) => ({ kind: 'placeholder' as const, ...p }))
]

export const ActivityBar = (): JSX.Element => {
  const visiblePerSide = useUiStore((s) => s.visiblePerSide)
  const dockSide = useUiStore((s) => s.dockSide)
  const showToolWindow = useUiStore((s) => s.showToolWindow)
  const showPlaceholder = useUiStore((s) => s.showPlaceholder)
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel)

  const isItemActive = (item: ActivityItem): boolean => {
    if (item.kind === 'tw') {
      const side = dockSide[item.id]
      return visiblePerSide[side] === item.id
    }
    return visiblePerSide.left === item.id
  }

  return (
    <nav
      aria-label="Activity Bar"
      className="w-12 h-full bg-bg-elevated border-r border-border flex flex-col items-center py-2 gap-1 flex-shrink-0"
      data-testid="activity-bar"
    >
      {ITEMS.map((item) => {
        const isActive = isItemActive(item)
        const Icon = item.icon
        const side = item.kind === 'tw' ? dockSide[item.id] : 'left'
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (!isActive && item.kind === 'tw') {
                showToolWindow(item.id)
              } else if (!isActive && item.kind === 'placeholder') {
                showPlaceholder(item.id)
              } else {
                // 已激活 → 收起左槽(PyCharm 行为)
                toggleLeftPanel()
              }
            }}
            title={item.label}
            aria-label={item.label}
            aria-pressed={isActive}
            data-testid={`activity-${item.id}`}
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
        )
      })}
    </nav>
  )
}
