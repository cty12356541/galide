/**
 * DockDropOverlay — 拖拽过程中的停靠目标热区与非法投放禁止提示层(Phase 3)
 */
import { MoveLeft, MoveRight, MoveDown, AppWindow, Ban } from 'lucide-react'
import { useUiStore } from '../../lib/store'
import { usePanelFloat } from '../../lib/hooks/use-panel-float'
import {
  evaluatePanelDrop,
  executePanelDrop,
  panelDndStore,
  readDraggedPanelId,
  setDropEffect,
  usePanelDndStore,
  type DropZoneId
} from './panel-dnd'
import { cn } from '../../lib/utils'

interface ZoneConfig {
  zone: DropZoneId
  label: string
  icon: typeof MoveLeft
  positionClass: string
}

const DOCK_ZONES: readonly ZoneConfig[] = [
  {
    zone: 'left',
    label: '停靠左侧',
    icon: MoveLeft,
    positionClass: 'left-2 top-1/2 -translate-y-1/2 w-28 h-24'
  },
  {
    zone: 'right',
    label: '停靠右侧',
    icon: MoveRight,
    positionClass: 'right-2 top-1/2 -translate-y-1/2 w-28 h-24'
  },
  {
    zone: 'bottom',
    label: '停靠底部',
    icon: MoveDown,
    positionClass: 'bottom-2 left-1/2 -translate-x-1/2 w-44 h-14'
  },
  {
    zone: 'floating',
    label: '独立浮出',
    icon: AppWindow,
    positionClass: 'top-2 right-2 w-32 h-11'
  }
]

export const DockDropOverlay = (): JSX.Element | null => {
  const draggingPanelId = usePanelDndStore((s) => s.draggingPanelId)
  const hoveredZone = usePanelDndStore((s) => s.hoveredZone)
  const rejectedFeedback = usePanelDndStore((s) => s.rejectedFeedback)
  const floatingPanels = useUiStore((s) => s.floatingPanels)
  const float = usePanelFloat()

  if (!draggingPanelId && !rejectedFeedback) return null

  const bindZoneHandlers = (zone: DropZoneId) => ({
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
      const dragged = readDraggedPanelId(e.dataTransfer, draggingPanelId)
      const ev = evaluatePanelDrop(dragged, zone, floatingPanels)
      e.preventDefault()
      e.stopPropagation()
      setDropEffect(e.dataTransfer, ev.allowed ? 'move' : 'none')
      if (panelDndStore.getState().hoveredZone !== zone) {
        panelDndStore.getState().setHoveredZone(zone)
      }
    },
    onDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
      e.stopPropagation()
      if (panelDndStore.getState().hoveredZone === zone) {
        panelDndStore.getState().setHoveredZone(null)
      }
    },
    onDrop: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const dragged = readDraggedPanelId(e.dataTransfer, draggingPanelId)
      executePanelDrop(dragged, zone, float)
    }
  })

  const editorEval = draggingPanelId
    ? evaluatePanelDrop(draggingPanelId, 'editor-core', floatingPanels)
    : null
  const isEditorHovered = hoveredZone === 'editor-core'

  return (
    <div
      className="pointer-events-none absolute inset-0 z-40"
      data-testid="dock-drop-overlay"
    >
      {draggingPanelId ? (
        <>
          {/* 中心编辑器大陆反向投放守卫热区 */}
          <div
            {...bindZoneHandlers('editor-core')}
            data-testid="dock-drop-editor-core"
            data-drop-state={
              isEditorHovered ? (editorEval?.allowed ? 'allowed' : 'forbidden') : 'idle'
            }
            className={cn(
              'pointer-events-auto absolute left-36 right-36 top-16 bottom-20 rounded-xl border-2 border-dashed flex items-center justify-center transition-all',
              isEditorHovered && editorEval && !editorEval.allowed
                ? 'border-danger bg-danger-soft/85 text-danger shadow-md'
                : 'border-transparent bg-transparent text-transparent'
            )}
          >
            {isEditorHovered && editorEval && !editorEval.allowed ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface/95 border border-danger/40 text-danger text-xs font-medium shadow-sm">
                <Ban className="w-3.5 h-3.5 shrink-0" />
                <span>{editorEval.reason}</span>
              </div>
            ) : null}
          </div>

          {/* 左 / 右 / 底 / 浮出 四大停靠目标区 */}
          {DOCK_ZONES.map(({ zone, label, icon: Icon, positionClass }) => {
            const ev = evaluatePanelDrop(draggingPanelId, zone, floatingPanels)
            const hovered = hoveredZone === zone
            const stateAttr = !ev.allowed
              ? 'forbidden'
              : hovered
                ? 'allowed'
                : 'idle'

            return (
              <div
                key={zone}
                {...bindZoneHandlers(zone)}
                data-testid={`dock-drop-${zone}`}
                data-drop-state={stateAttr}
                className={cn(
                  'pointer-events-auto absolute rounded-xl border-2 flex flex-col items-center justify-center gap-1 px-2 text-center text-xs font-medium backdrop-blur-sm shadow-md transition-all',
                  positionClass,
                  !ev.allowed
                    ? cn(
                        'border-dashed border-danger/60 bg-danger-soft/85 text-danger cursor-not-allowed',
                        hovered && 'border-solid border-danger ring-2 ring-danger/30'
                      )
                    : hovered
                      ? 'border-solid border-accent bg-accent-soft/95 text-accent ring-2 ring-accent/30 scale-[1.02]'
                      : 'border-dashed border-accent/50 bg-surface/90 text-text-muted hover:text-text'
                )}
              >
                {ev.allowed ? (
                  <>
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{label}</span>
                  </>
                ) : (
                  <>
                    <Ban className="w-4 h-4 shrink-0" />
                    <span className="text-[11px] leading-tight">{ev.reason}</span>
                  </>
                )}
              </div>
            )
          })}
        </>
      ) : null}

      {rejectedFeedback ? (
        <div
          role="alert"
          data-testid="dock-drop-rejected-banner"
          className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-danger-soft border border-danger/40 text-danger text-xs font-medium shadow-md"
        >
          <Ban className="w-3.5 h-3.5 shrink-0" />
          <span>{rejectedFeedback.reason}</span>
        </div>
      ) : null}
    </div>
  )
}
