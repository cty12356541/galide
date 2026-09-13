/**
 * ApiKeyInput — API key input with show/hide toggle
 */
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '../../../lib/utils'

const inputCls =
  'w-full bg-transparent border border-border rounded-lg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors'

export const ApiKeyInput = ({
  value,
  onChange,
  placeholder = '粘贴 API Key',
  disabled = false
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}): JSX.Element => {
  const [show, setShow] = useState(false)
  return (
    <div className="flex items-center gap-1.5">
      <input
        type={show ? 'text' : 'password'}
        className={cn(inputCls, 'flex-1 font-mono text-[12px]')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="h-8 w-8 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface transition-colors"
        aria-label={show ? '隐藏 Key' : '显示 Key'}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}
