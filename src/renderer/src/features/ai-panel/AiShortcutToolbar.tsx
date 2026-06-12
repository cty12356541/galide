import { ArrowRight, RefreshCw, Wand2, Languages, ChevronDown } from 'lucide-react'

const SHORTCUTS = [
  { id: 'continue', label: '续写', icon: ArrowRight, prompt: '续写下一段对白,保持角色性格。' },
  { id: 'rewrite', label: '改写', icon: RefreshCw, prompt: '改写选中的段落,更生动。' },
  { id: 'polish', label: '润色', icon: Wand2, prompt: '润色对白,让情感更细腻。' },
  { id: 'translate', label: '翻译', icon: Languages, prompt: '翻译成日文,保持 galgame 风格。' }
] as const

type ProviderInfo = { id: string; name: string }

export const AiShortcutToolbar = ({
  onShortcut,
  provider,
  onProviderChange,
  providers
}: {
  onShortcut: (prompt: string) => void
  provider: string
  onProviderChange: (p: 'openai' | 'claude' | 'ollama') => void
  providers: ProviderInfo[]
}): JSX.Element => {
  return (
    <div className="border-b border-border p-2 space-y-2">
      <div className="grid grid-cols-4 gap-1">
        {SHORTCUTS.map((s) => {
          const Icon = s.icon
          return (
            <button
              key={s.id}
              onClick={() => onShortcut(s.prompt)}
              className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-bg-elevated text-text-muted hover:text-text transition-colors"
              title={s.prompt}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[10px]">{s.label}</span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2 px-1">
        <span className="text-[10px] text-text-muted">Provider</span>
        <div className="relative">
          <select
            value={provider}
            onChange={(e) => onProviderChange(e.target.value as never)}
            className="text-xs bg-bg border border-border rounded-md px-2 py-1 pr-6 appearance-none focus:outline-none focus:ring-1 focus:ring-accent"
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
          <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted" />
        </div>
      </div>
    </div>
  )
}
