/**
 * ActivityBar — 左侧 6 个图标按钮(scripts / characters / voice / assets / outline / git)
 *
 * 规约 Rule 1: 一个面板 = 一个 feature。ActivityBar 6 项对应 SidePanel 6 panel,
 * 每个按钮独立 toggle(multi-split),不在 store 里用单值 state。
 *
 * 行为:
 *  - 6 个图标按钮(用 lucide-react)
 *  - 当前 active 列表里有的按钮高亮(activeBackground)
 *  - 点击 toggleActivity(id)(store 里 add / remove from activeActivity[])
 *  - dirty 状态:当前 panel 有未保存改动时按钮上加小圆点提示(占位,后续 PR 接)
 *
 * 样式:
 *  - 宽度 48px,纵向排列,顶部留 8px,底部 8px
 *  - 按钮 36x36,居中,圆角 8px
 *  - active: bg-accent-soft / text-accent
 *  - inactive: text-text-muted hover:text-text hover:bg-bg-elevated
 */

import {
  FileText,
  User,
  Volume2,
  Image as ImageIcon,
  ListTree,
  GitBranch,
  type LucideIcon
} from 'lucide-react'
import { useUiStore } from '../../lib/store'
import type { ActivityBarItemId } from '../../lib/workspace-layout'
import { cn } from '../../lib/utils'

type ActivityButtonSpec = {
  id: ActivityBarItemId
  icon: LucideIcon
  title: string
}

const ACTIVITY_BUTTONS: readonly ActivityButtonSpec[] = [
  { id: 'scripts', icon: FileText, title: '剧本' },
  { id: 'characters', icon: User, title: '角色' },
  { id: 'voice', icon: Volume2, title: '语音' },
  { id: 'assets', icon: ImageIcon, title: '资产' },
  { id: 'outline', icon: ListTree, title: '大纲' },
  { id: 'git', icon: GitBranch, title: 'Git' }
]

export const ActivityBar = (): JSX.Element => {
  const activeActivity = useUiStore((s) => s.workspaceLayout.activeActivity)
  const toggleActivity = useUiStore((s) => s.toggleActivity)

  return (
    <nav
      aria-label="Activity Bar"
      className="w-12 bg-surface border-r border-border flex flex-col items-center py-2 gap-1"
    >
      {ACTIVITY_BUTTONS.map(({ id, icon: Icon, title }) => {
        const isActive = activeActivity.includes(id)
        return (
          <button
            key={id}
            type="button"
            onClick={() => toggleActivity(id)}
            title={title}
            aria-label={title}
            aria-pressed={isActive}
            data-testid={`activity-${id}`}
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
              isActive
                ? 'bg-accent-soft text-accent'
                : 'text-text-muted hover:text-text hover:bg-bg-elevated'
            )}
          >
            <Icon className="w-4 h-4" />
          </button>
        )
      })}
    </nav>
  )
}