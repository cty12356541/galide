import { ArrowRight, RefreshCw, Wand2, Languages, Sparkles, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

const SHORTCUTS = [
  { id: 'continue', label: '续写', icon: ArrowRight, prompt: '续写下一段对白,保持角色性格。' },
  { id: 'rewrite', label: '改写', icon: RefreshCw, prompt: '改写选中的段落,更生动。' },
  { id: 'polish', label: '润色', icon: Wand2, prompt: '润色对白,让情感更细腻。' },
  { id: 'translate', label: '翻译', icon: Languages, prompt: '翻译成日文,保持 galgame 风格。' }
] as const

type ProviderInfo = { id: string; name: string }

const PROVIDER_DOT: Record<string, string> = {
  openai: 'bg-success',
  claude: 'bg-accent',
  ollama: 'bg-warning'
}

/**
 * AI 快捷动作 + Provider 选择器(v0.5 重设计)
 *
 * 设计改动:
 *  - 4 个快捷动作从 2×2 网格改成横排 chip(linear),h-7 圆角胶囊,激活态 accent-soft
 *  - Provider 用 chip + dot(代表 provider 颜色)+ 下拉箭头,视觉锚点
 *  - 整体 h-12 单一横条,不再占 2 行
 *  - 顶部用 1px border-b 跟下面消息区分
 */
export const AiShortcutToolbar = ({
  onShortcut,
  provider,
  onProviderChange,
  providers,
  activeShortcut
}: {
  onShortcut: (prompt: string, id: string) => void
  provider: string
  onProviderChange: (p: 'openai' | 'claude' | 'ollama') => void
  providers: ProviderInfo[]
  activeShortcut?: string | null
}): JSX.Element => {
  return (
    <div className="h-12 flex items-center gap-1 px-2 border-b border-border bg-surface flex-shrink-0">
      <Sparkles className="w-3.5 h-3.5 text-accent mr-1.5 shrink-0" />

      {/* 4 个快捷动作 chip */}
      <div className="flex items-center gap-0.5">
        {SHORTCUTS.map((s) => {
          const Icon = s.icon
          const isActive = activeShortcut === s.id
          return (
            <button
              key={s.id}
              onClick={() => onShortcut(s.prompt, s.id)}
              className={cn(
                'h-7 px-2.5 rounded-full flex items-center gap-1 text-[11px] font-medium transition-all',
                isActive
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-text-muted hover:text-text hover:bg-bg-elevated'
              )}
              title={s.prompt}
              data-testid={`ai-shortcut-${s.id}`}
            >
              <Icon className="w-3 h-3" />
              {s.label}
            </button>
          )
        })}
      </div>

      <div className="w-px h-4 bg-border mx-1.5" />

      {/* Provider 选择器(chip + dot + 下拉) */}
      <div className="relative">
        <select
          value={provider}
          onChange={(e) => onProviderChange(e.target.value as never)}
          className="h-7 pl-2 pr-6 rounded-full text-[11px] font-medium text-text-muted hover:text-text bg-transparent hover:bg-bg-elevated transition-colors appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/30"
          data-testid="ai-provider-select"
        >
          {providers.length > 0
            ? providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))
            : ['openai', 'claude', 'ollama'].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
        </select>
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              PROVIDER_DOT[provider] ?? 'bg-text-muted'
            )}
          />
        </div>
        <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted" />
      </div>

      <div className="flex-1" />
    </div>
  )
}
