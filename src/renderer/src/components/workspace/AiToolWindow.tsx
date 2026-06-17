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
import { AiPanel } from '../../features/ai-panel/AiPanel'
import { cn } from '../../lib/utils'

export const AiToolWindow = (): JSX.Element => {
  const toggleAiPanel = useUiStore((s) => s.toggleAiPanel)
  const setAiDockedLocation = useUiStore((s) => s.setAiDockedLocation)
  const location = useUiStore((s) => s.aiDockedLocation)

  return (
    <section className="h-full flex flex-col bg-surface" data-testid="ai-tool-window">
      <header className="h-9 flex items-center border-b border-border px-2 gap-2">
        <Sparkles className="w-3.5 h-3.5 text-accent" />
        <span className="text-xs font-medium">AI 助手</span>
        <div className="flex-1" />
        <DockedLocationMenu location={location} setLocation={setAiDockedLocation} />
        <button
          type="button"
          onClick={toggleAiPanel}
          title="关闭 AI"
          aria-label="关闭 AI"
          className="h-7 w-7 rounded flex items-center justify-center text-text-muted hover:text-text hover:bg-bg-elevated transition-colors"
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
  setLocation
}: {
  location: 'right' | 'bottom' | 'left' | 'floating'
  setLocation: (loc: 'right' | 'bottom' | 'left' | 'floating') => void
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
        className="h-7 px-2 rounded flex items-center gap-1 text-text-muted hover:text-text hover:bg-bg-elevated transition-colors text-xs"
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
          <ul className="absolute right-0 mt-1 w-28 bg-bg-elevated border border-border rounded shadow-lg z-50 py-1 text-xs">
            {opts.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => {
                    setLocation(id)
                    setOpen(false)
                  }}
                  className={cn(
                    'w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-bg transition-colors text-left',
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

