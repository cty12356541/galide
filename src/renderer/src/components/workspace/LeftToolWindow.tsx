/**
 * LeftToolWindow — 占位主岛(search / debug / settings)
 *
 * 功能即岛 v2:6 个真实功能主岛统一走 SideToolWindow;本组件仅渲染
 * 3 个尚未实现的占位项,保持布局稳定。占位主岛不可浮出(无 float action)。
 */
import { X, Search, Bug, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useUiStore } from '../../lib/store'
import { PlaceholderToolWindow } from './PlaceholderToolWindow'
import { ScriptSearchPanel } from '../../features/search/ScriptSearchPanel'
import { Button } from '../ui/button'
import type { PlaceholderId } from './mosaic/panel-registry'

const PLACEHOLDERS: Record<PlaceholderId, { icon: LucideIcon; title: string; description: string }> = {
  search: { icon: Search, title: '搜索', description: '跨 scripts/*.gal 全文搜索' },
  debug: { icon: Bug, title: '调试', description: '运行/断点/变量查看(即将支持)' },
  settings: { icon: Settings, title: '设置', description: '打开 IDE 偏好配置' }
}

export const LeftToolWindow = ({ placeholderId }: { placeholderId: PlaceholderId }): JSX.Element => {
  const meta = PLACEHOLDERS[placeholderId]
  const Icon = meta.icon
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel)
  const openPreferences = useUiStore((s) => s.openPreferences)

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
        {placeholderId === 'search' ? (
          <ScriptSearchPanel />
        ) : placeholderId === 'debug' ? (
          <PlaceholderToolWindow icon={meta.icon} title={meta.title} description={meta.description} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
            <Icon className="w-8 h-8 text-text-muted opacity-50" />
            <p className="text-sm text-text-muted max-w-[220px]">{meta.description}</p>
            <Button
              size="sm"
              onClick={() => {
                if (placeholderId === 'settings') openPreferences()
              }}
            >
              打开偏好设置
            </Button>
          </div>
        )}
      </div>
    </aside>
  )
}
