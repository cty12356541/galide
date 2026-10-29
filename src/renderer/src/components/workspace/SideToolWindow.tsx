/**
 * SideToolWindow — 主岛壳(功能即岛 v3 + Phase 3 HTML5 DnD 拖拽源/浮出按钮 drop 目标)
 */
import { X, AppWindow, ExternalLink } from 'lucide-react'
import { useUiStore } from '../../lib/store'
import { usePanelFloat } from '../../lib/hooks/use-panel-float'
import {
  TOOL_WINDOW_META,
  isMultiSubIsland,
  type ToolWindowId
} from './panels/panel-registry'
import { DockedLocationMenu } from './DockedLocationMenu'
import {
  evaluatePanelDrop,
  executePanelDrop,
  panelDndStore,
  readDraggedPanelId,
  setDropEffect,
  usePanelDndStore,
  writePanelDragData
} from './panel-dnd'
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
  const draggingPanelId = usePanelDndStore((s) => s.draggingPanelId)
  const hoveredZone = usePanelDndStore((s) => s.hoveredZone)
  const float = usePanelFloat()

  const multi = isMultiSubIsland(toolWindowId)
  const ActiveComp =
    meta.subIslands.find((s) => s.id === activeSub)?.component ?? meta.subIslands[0]!.component

  const close = (): void => {
    if (floating) {
      window.close()
    } else {
      hideToolWindow(toolWindowId)
    }
  }

  const floatEval = draggingPanelId
    ? evaluatePanelDrop(draggingPanelId, 'floating', floatingPanels)
    : null

  return (
    <aside
      className={cn(
        'group island h-full flex flex-col bg-surface overflow-hidden rounded-xl transition-opacity',
        draggingPanelId === toolWindowId && 'opacity-70 ring-1 ring-accent/40'
      )}
      data-testid={floating ? `floating-island-${toolWindowId}` : `side-tool-window-${toolWindowId}`}
    >
      <header
        draggable={!floating || undefined}
        onDragStart={
          !floating
            ? (e) => {
                writePanelDragData(e.dataTransfer, toolWindowId)
                panelDndStore.getState().startDrag(toolWindowId)
              }
            : undefined
        }
        onDragEnd={
          !floating
            ? () => {
                panelDndStore.getState().endDrag()
              }
            : undefined
        }
        data-testid={`side-header-${toolWindowId}`}
        data-draggable-panel={!floating ? toolWindowId : undefined}
        className={cn(
          'h-9 flex items-center bg-bg-elevated px-2.5 gap-1.5 flex-shrink-0',
          !floating && 'cursor-grab active:cursor-grabbing select-none'
        )}
      >
        <Icon className="w-3.5 h-3.5 text-accent" />
        <span className="text-xs font-medium">{meta.title}</span>
        <div className="flex-1" />
        {!floating ? (
          <>
            <DockedLocationMenu toolWindowId={toolWindowId} />
            <button
              type="button"
              onClick={() => float(toolWindowId)}
              onDragOver={(e) => {
                const dragged = readDraggedPanelId(e.dataTransfer, draggingPanelId)
                const ev = evaluatePanelDrop(dragged, 'floating', floatingPanels)
                e.preventDefault()
                setDropEffect(e.dataTransfer, ev.allowed ? 'move' : 'none')
                panelDndStore.getState().setHoveredZone('floating')
              }}
              onDragLeave={() => {
                if (panelDndStore.getState().hoveredZone === 'floating') {
                  panelDndStore.getState().setHoveredZone(null)
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const dragged = readDraggedPanelId(e.dataTransfer, draggingPanelId)
                executePanelDrop(dragged, 'floating', float)
              }}
              title="浮出整主岛(或拖拽面板至此浮出)"
              aria-label="浮出整主岛"
              data-testid={`side-float-${toolWindowId}`}
              className={cn(
                'h-7 w-7 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface transition-all',
                draggingPanelId
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                hoveredZone === 'floating' &&
                  floatEval?.allowed &&
                  'bg-accent-soft text-accent ring-1 ring-accent',
                hoveredZone === 'floating' &&
                  floatEval &&
                  !floatEval.allowed &&
                  'bg-danger-soft text-danger ring-1 ring-danger'
              )}
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
