import { Input } from '../../../components/ui/input'
import { ChevronDown } from 'lucide-react'

type Props = {
  value: string
  options: string[]
  onChange: (v: string) => void
  placeholder?: string
}

export const ModelEditor = ({ value, options, onChange, placeholder }: Props): JSX.Element => {
  const custom = !options.includes(value) && value.length > 0
  return (
    <div className="relative inline-block w-72">
      {custom ? (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-8"
        />
      ) : (
        <>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-9 px-3 pr-8 rounded-lg border border-border bg-bg text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            <option value="__custom__">自定义…</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted" />
        </>
      )}
      {custom && (
        <button
          onClick={() => onChange(options[0] ?? '')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted hover:text-text"
        >
          重置
        </button>
      )}
    </div>
  )
}
