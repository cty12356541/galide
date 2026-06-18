/**
 * SideToolWindow — 主岛壳(功能即岛 v2)
 *
 * PyCharm 风格主岛:统一 header(图标+标题+ dock 菜单 + 浮出 + 关闭)+ 内容区。
 * 多子岛主岛(项目/角色)渲染 tab 条,每个子岛可单独脱离为独立窗;
 * 单子岛主岛(Git/大纲/AI)无 tab,header 直接浮出整主岛。
 *
 * docked 模式(floating=false):关闭=收起该侧槽;浮出=整主岛脱离
 * floating 模式(floating=true):关闭=window.close();不渲染 dock 菜单/浮出按钮
 *
 * 子岛脱离态:浮出中的 tab 置灰+角标;点击该 tab = 召回(关浮出窗+restore)
 */
import { X, AppWindow, ExternalLink } from 'lucide-react'
import { useUiStore } from '../../lib/store'
import { usePanelFloat } from '../../lib/hooks/use-panel-float'
import {
  TOOL_WINDOW_META,
  isMultiSubIsland,
  type ToolWindowId,
} from './mosaic/panel-registry'
import { DockedLocationMenu } from './DockedLocationMenu'
import { cn } from '../../lib/utils'

export const SideToolWindow = ({
  toolWindowId,
  floating = false
}: {
  toolWindowId: ToolWindowId
  floating?: boolean
}): JSX.Element => {
  const meta = TOOL_WINDOW_META[toolWindowId]
  const Icon = meta.icon

  const activeSub = useUiStore((s) => s.activeSubIsland[toolWindowId])
  const setActiveSubIsland = useUiStore((s) => s.setActiveSubIsland)
  const hideToolWindow = useUiStore((s) => s.hideToolWindow)
  const floatingPanels = useUiStore((s) => s.floatingPanels)
  const float = usePanelFloat()

  const multi = isMultiSubIsland(toolWindowId)
  const ActiveComp = meta.subIslands.find((s) => s.id === activeSub)?.component ?? meta.subIslands[0].component

  const close = (): void => {
    if (floating) {
      window.close()
    } else {
      hideToolWindow(toolWindowId)
    }
  }

  return (
    <aside
      className="group island h-full flex flex-col bg-surface overflow-hidden rounded-xl"
      data-testid={floating ? `floating-island-${toolWindowId}` : `side-tool-window-${toolWindowId}`}
    >
      <header className="h-9 flex items-center bg-bg-elevated px-2.5 gap-1.5 flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-accent" />
        <span className="text-xs font-medium">{meta.title}</span>
        <div className="flex-1" />
        {!floating ? (
          <>
            <DockedLocationMenu toolWindowId={toolWindowId} />
            <button
              type="button"
              onClick={() => float(toolWindowId)}
              title="浮出整主岛"
              aria-label="浮出整主岛"
              data-testid={`side-float-${toolWindowId}`}
              className="h-7 w-7 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            >
              <AppWindow className="w-3.5 h-3.5" />
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={close}
          title={floating ? '关闭浮出窗口' : '关闭 Tool Window'}
          aria-label={floating ? '关闭浮出窗口' : '关闭 Tool Window'}
          data-testid={`side-close-${toolWindowId}`}
          className="h-7 w-7 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </header>

      {multi ? (
        <div className="h-8 flex items-stretch bg-bg-elevated border-b border-border px-1.5 gap-0.5 flex-shrink-0">
          {meta.subIslands.map((sub) => {
            const isFloating = floatingPanels.includes(sub.id)
            const isActive = activeSub === sub.id
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => {
                  if (isFloating) {
                    // 召回浮出的子岛:关闭浮出窗(其 closed → restore tab)
                    void window.galide.workspace.closePanel({ panelId: sub.id })
                    return
                  }
                  setActiveSubIsland(toolWindowId, sub.id)
                }}
                title={isFloating ? `召回 ${sub.label}` : sub.label}
                data-testid={`sub-tab-${toolWindowId}-${sub.id}`}
                className={cn(
                  'h-7 px-2.5 rounded-md flex items-center gap-1 text-[12px] transition-colors',
                  isActive && !isFloating
                    ? 'bg-surface text-text font-medium'
                    : 'text-text-muted hover:text-text hover:bg-surface',
                  isFloating && 'opacity-50'
                )}
              >
                <sub.icon className="w-3 h-3" />
                {sub.label}
                {isFloating ? (
                  <span
                    className="ml-0.5 inline-flex items-center justify-center text-text-muted"
                    title="浮出中,点击召回"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-hidden">
        <ActiveComp />
      </div>
    </aside>
  )
}
