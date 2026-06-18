/**
 * AiToolWindow — AI 聊天 Tool Window
 *
 * 设计:
 *   - 复用 features/ai-panel/AiPanel 内部组件
 *   - 当 docked 在 right / bottom 时由 CenterSplit 包到 PanelGroup 里
 *   - 当 docked 在 floating 时(PR2)— 走独立 BrowserWindow
 *
 * 现在(PR1):
 *   - 简单包装,加 header(标题 + 关闭按钮 + 移动菜单)
 *   - 内部直接挂 AiPanel
 */
import { useState } from 'react'
import { Sparkles, X, MoveRight, MoveDown, MoveLeft, AppWindow } from 'lucide-react'
import { useUiStore } from '../../lib/store'
import { usePanelFloat } from '../../lib/hooks/use-panel-float'
import { AiPanel } from '../../features/ai-panel/AiPanel'
import { cn } from '../../lib/utils'

export const AiToolWindow = (): JSX.Element => {
  const toggleAiPanel = useUiStore((s) => s.toggleAiPanel)
  const setAiDockedLocation = useUiStore((s) => s.setAiDockedLocation)
  const location = useUiStore((s) => s.aiDockedLocation)
  const float = usePanelFloat()

  return (
    <section className="group island h-full flex flex-col bg-surface overflow-hidden rounded-xl" data-testid="ai-tool-window">
      <header className="h-9 flex items-center bg-bg-elevated border-b border-border px-2.5 gap-1.5 min-w-0">
        <Sparkles className="w-3.5 h-3.5 text-accent" />
        <span className="text-xs font-medium">AI 助手</span>
        <div className="flex-1" />
        <DockedLocationMenu location={location} setLocation={setAiDockedLocation} onFloat={() => float('ai-tool-window')} />
        <button
          type="button"
          onClick={toggleAiPanel}
          title="关闭 AI"
          aria-label="关闭 AI"
          className="h-8 w-8 ml-1 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </header>
      <div className="flex-1 overflow-hidden">
        <AiPanel />
      </div>
    </section>
  )
}

const DockedLocationMenu = ({
  location,
  setLocation,
  onFloat
}: {
  location: 'right' | 'bottom' | 'left' | 'floating'
  setLocation: (loc: 'right' | 'bottom' | 'left' | 'floating') => void
  onFloat: () => void
}): JSX.Element => {
  const [open, setOpen] = useState(false)
  const opts = [
    { id: 'right' as const, label: '右侧', icon: MoveRight },
    { id: 'bottom' as const, label: '底部', icon: MoveDown },
    { id: 'left' as const, label: '左侧', icon: MoveLeft },
    { id: 'floating' as const, label: '浮出', icon: AppWindow }
  ]
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="移动 AI"
        aria-label="移动 AI"
        className="h-8 px-2.5 rounded-md flex items-center gap-1 text-text-muted hover:text-text hover:bg-surface transition-colors text-[13px] font-medium min-w-[64px] justify-between"
      >
        {opts.find((o) => o.id === location)?.label ?? '右侧'}
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
                  onClick={() => {
                    if (id === 'floating') {
                      onFloat()
                    } else {
                      setLocation(id)
                    }
                    setOpen(false)
                  }}
                  className={cn(
                    'w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-bg-elevated transition-colors text-left',
                    location === id ? 'text-accent' : 'text-text'
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
