import { Check, Key } from 'lucide-react'
import { cn } from '../../../lib/utils'

type ProviderItem = {
  id: string
  label: string
  hasKey: boolean
}

type Props = {
  providers: ProviderItem[]
  current: string
  onSelect: (id: string) => void
}

export const ProviderToolbar = ({ providers, current, onSelect }: Props): JSX.Element => {
  return (
    <div className="flex flex-wrap gap-2">
      {providers.map((p) => {
        const isCurrent = p.id === current
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={cn(
              'group flex items-center gap-2 px-3 py-2 rounded-xl border transition-all',
              isCurrent
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border bg-surface text-text hover:border-accent/50'
            )}
          >
            <div className="flex items-center gap-1.5">
              {isCurrent && <Check className="w-3.5 h-3.5" />}
              <span className="text-sm font-medium">{p.label}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-text-muted">
              <Key className="w-3 h-3" />
              {p.hasKey ? '已配置' : '未配置'}
            </div>
          </button>
        )
      })}
    </div>
  )
}
