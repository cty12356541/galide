/**
 * DockedLocationMenu — 通用 dock 移动菜单(功能即岛 v2)
 *
 * 从 AiToolWindow 提取为通用件:任意主岛 header 复用。
 * 选项:左侧 / 右侧 / 底部 / 浮出。选侧 = setDockSide + showToolWindow;
 * 选浮出 = usePanelFloat(toolWindowId)。
 */
import { useState } from 'react'
import { MoveRight, MoveDown, MoveLeft, AppWindow } from 'lucide-react'
import { useUiStore } from '../../lib/store'
import { usePanelFloat } from '../../lib/hooks/use-panel-float'
import { cn } from '../../lib/utils'
import type { ToolWindowId, DockSide } from './mosaic/panel-registry'

export const DockedLocationMenu = ({
  toolWindowId
}: {
  toolWindowId: ToolWindowId
}): JSX.Element => {
  const [open, setOpen] = useState(false)
  const dockSide = useUiStore((s) => s.dockSide[toolWindowId])
  const setDockSide = useUiStore((s) => s.setDockSide)
  const showToolWindow = useUiStore((s) => s.showToolWindow)
  const float = usePanelFloat()

  const opts: { id: DockSide | 'floating'; label: string; icon: typeof MoveRight }[] = [
    { id: 'left', label: '左侧', icon: MoveLeft },
    { id: 'right', label: '右侧', icon: MoveRight },
    { id: 'bottom', label: '底部', icon: MoveDown },
    { id: 'floating', label: '浮出', icon: AppWindow }
  ]

  const choose = (id: DockSide | 'floating'): void => {
    if (id === 'floating') {
      float(toolWindowId)
    } else {
      setDockSide(toolWindowId, id)
      showToolWindow(toolWindowId)
    }
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="移动工具窗"
        aria-label="移动工具窗"
        data-testid={`dock-menu-${toolWindowId}`}
        className="h-7 px-2 rounded-md flex items-center gap-1 text-text-muted hover:text-text hover:bg-surface transition-colors text-[12px] min-w-[52px] justify-between"
      >
        {opts.find((o) => o.id === dockSide)?.label ?? '左侧'}
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
            tabIndex={-1}
          />
          <ul className="absolute right-0 mt-1 w-28 bg-surface border border-border rounded-md shadow-lg z-50 py-1 text-[13px]">
            {opts.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => choose(id)}
                  className={cn(
                    'w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-bg-elevated transition-colors text-left',
                    dockSide === id ? 'text-accent' : 'text-text'
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}
