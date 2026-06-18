/**
 * SideToolWindow — 侧边岛通用壳(功能模块即岛)
 *
 * PyCharm 风格:每个功能模块是一个独立岛,本壳接收 panelId,
 * 渲染统一 header(图标+标题+浮出按钮+关闭按钮)+ 对应 feature panel。
 * 取代旧 LeftToolWindow 的 activitySelection 内部切 view。
 *
 * 行为:
 *   - 浮出按钮 → usePanelFloat(panelId),脱离主窗为独立 BrowserWindow
 *   - 关闭按钮 → toggleLeftPanel(收起左槽)
 *   - 侧边岛同一时刻左槽只显示一个(ActivityBar 单选)
 */
import { X, AppWindow } from 'lucide-react'
import { useUiStore } from '../../lib/store'
import { usePanelFloat } from '../../lib/hooks/use-panel-float'
import { getPanelComponent, PANEL_META, type PanelId } from './mosaic/panel-registry'

export const SideToolWindow = ({ panelId }: { panelId: PanelId }): JSX.Element => {
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel)
  const float = usePanelFloat()
  const meta = PANEL_META[panelId]
  const Panel = getPanelComponent(panelId)
  const Icon = meta.icon

  return (
    <aside
      className="group island h-full flex flex-col bg-surface overflow-hidden rounded-xl"
      data-testid={`side-tool-window-${panelId}`}
    >
      <header className="h-9 flex items-center bg-bg-elevated px-2.5 gap-1.5 flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-accent" />
        <span className="text-xs font-medium">{meta.title}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => float(panelId)}
          title="浮出到独立窗口"
          aria-label="浮出到独立窗口"
          data-testid={`side-float-${panelId}`}
          className="h-7 w-7 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <AppWindow className="w-3.5 h-3.5" />
        </button>
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
        <Panel />
      </div>
    </aside>
  )
}
