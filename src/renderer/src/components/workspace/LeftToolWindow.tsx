/**
 * LeftToolWindow — 占位 Tool Window(search / debug / settings)
 *
 * 功能模块即岛重构后,6 个真实功能岛(project/git/outline/character/voice/asset)
 * 统一走 SideToolWindow。本组件仅渲染 3 个尚未实现的占位项,保持布局稳定,
 * 后续接通具体功能时直接升级为真实岛。
 *
 * 占位项不可浮出(PyCharm 行为:未实现工具窗无 float action),仅提供关闭。
 */
import { X, Search, Bug, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useUiStore } from '../../lib/store'
import { PlaceholderToolWindow } from './PlaceholderToolWindow'

type PlaceholderKey = 'search' | 'debug' | 'settings'

const PLACEHOLDERS: Record<PlaceholderKey, { icon: LucideIcon; title: string; description: string }> = {
  search: { icon: Search, title: '搜索', description: '跨文件全文搜索(即将支持)' },
  debug: { icon: Bug, title: '调试', description: '运行/断点/变量查看(即将支持)' },
  settings: { icon: Settings, title: '设置', description: 'IDE 偏好配置(即将支持)' }
}

export const LeftToolWindow = (): JSX.Element => {
  const activitySelection = useUiStore((s) => s.activitySelection)
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel)

  const key: PlaceholderKey =
    activitySelection === 'debug' || activitySelection === 'settings' ? activitySelection : 'search'
  const meta = PLACEHOLDERS[key]
  const Icon = meta.icon

  return (
    <aside
      className="group island h-full flex flex-col bg-surface overflow-hidden rounded-xl"
      data-testid="left-tool-window"
    >
      <header className="h-9 flex items-center bg-bg-elevated px-2.5 gap-1.5 flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-accent" />
        <span className="text-xs font-medium">{meta.title}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={toggleLeftPanel}
          title="关闭 Tool Window"
          aria-label="关闭 Tool Window"
          className="h-7 w-7 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </header>
      <div className="flex-1 min-h-0 overflow-hidden">
        <PlaceholderToolWindow icon={meta.icon} title={meta.title} description={meta.description} />
      </div>
    </aside>
  )
}
