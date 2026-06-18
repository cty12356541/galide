/**
 * ActivityBar — PyCharm 风格左侧 Activity Bar
 *
 * 设计:
 *   - 竖向 icon 条,48px 宽
 *   - 5 个 icon:项目 / 搜索 / Git / 调试 / 设置
 *   - active: bg-accent-soft + 左侧 2px 紫色竖条
 *   - project/git 接通 LeftToolWindow,search/debug/settings 走占位
 *
 * ActivityBar 控制 store.activitySelection,LeftToolWindow 据此显示对应 panel。
 */
import { Folder, Search, GitBranch, Bug, Settings, ListTree, Users, Mic, Image } from 'lucide-react'
import { useUiStore, type ActivitySelection } from '../../lib/store'
import { cn } from '../../lib/utils'

type ActivityItem = {
  id: ActivitySelection
  icon: typeof Folder
  label: string
}

// PyCharm 风格:6 个真实功能岛 + 3 个占位(search/debug/settings 待实现)
const ITEMS: readonly ActivityItem[] = [
  { id: 'project', icon: Folder, label: '项目' },
  { id: 'search', icon: Search, label: '搜索' },
  { id: 'git', icon: GitBranch, label: 'Git' },
  { id: 'outline', icon: ListTree, label: '大纲' },
  { id: 'character', icon: Users, label: '角色' },
  { id: 'voice', icon: Mic, label: '语音' },
  { id: 'asset', icon: Image, label: '资产' },
  { id: 'debug', icon: Bug, label: '调试' },
  { id: 'settings', icon: Settings, label: '设置' }
]

export const ActivityBar = (): JSX.Element => {
  const activitySelection = useUiStore((s) => s.activitySelection)
  const setActivitySelection = useUiStore((s) => s.setActivitySelection)
  const leftPanelOpen = useUiStore((s) => s.leftPanelOpen)
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel)

  return (
    <nav
      aria-label="Activity Bar"
      className="w-12 h-full bg-bg-elevated border-r border-border flex flex-col items-center py-2 gap-1 flex-shrink-0"
      data-testid="activity-bar"
    >
      {ITEMS.map(({ id, icon: Icon, label }) => {
        const isActive = activitySelection === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              // 关闭状态时点击直接展开并切换
              if (!leftPanelOpen) toggleLeftPanel()
              setActivitySelection(id)
            }}
            title={label}
            aria-label={label}
            aria-pressed={isActive}
            data-testid={`activity-${id}`}
            className={cn(
              'relative w-9 h-9 rounded-md flex items-center justify-center transition-colors',
              isActive
                ? 'bg-accent-soft text-accent'
                : 'text-text-muted hover:text-text hover:bg-surface',
              isActive && 'after:absolute after:left-[-1px] after:top-2 after:bottom-2 after:w-0.5 after:bg-accent after:rounded-full'
            )}
          >
            <Icon className="w-[18px] h-[18px]" />
          </button>
        )
      })}
    </nav>
  )
}
