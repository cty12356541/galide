import { useState } from 'react'
import { Eye, EyeOff, Check, X } from 'lucide-react'
import { Input } from '../../../components/ui/input'
import { Button } from '../../../components/ui/button'
import { cn } from '../../../lib/utils'

type Props = {
  hasKey: boolean
  onSave: (key: string) => Promise<boolean>
  onDelete: () => Promise<boolean>
}

export const ApiKeyEditor = ({ hasKey, onSave, onDelete }: Props): JSX.Element => {
  const [reveal, setReveal] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSave = async (): Promise<void> => {
    if (!draft.trim()) return
    setBusy(true)
    try {
      const ok = await onSave(draft)
      if (ok) setDraft('')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    setBusy(true)
    try {
      await onDelete()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex-1 relative flex items-center',
            hasKey && !reveal && 'bg-bg-elevated border border-border rounded-md px-3 py-1.5 text-xs text-text-muted'
          )}
        >
          {hasKey && !reveal ? (
            <span>•••••••••••••••• (已保存)</span>
          ) : (
            <Input
              type={reveal ? 'text' : 'password'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="粘贴 API Key"
              disabled={busy}
              className="flex-1"
            />
          )}
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="ml-2 text-text-muted hover:text-text"
            title={reveal ? '隐藏' : '显示'}
          >
            {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {hasKey ? (
          <Button variant="ghost" size="sm" onClick={() => void handleDelete()} disabled={busy}>
            <X className="w-3.5 h-3.5 mr-1" />
            删除
          </Button>
        ) : null}
        {draft.trim() && (
          <Button size="sm" onClick={() => void handleSave()} disabled={busy}>
            <Check className="w-3.5 h-3.5 mr-1" />
            保存
          </Button>
        )}
      </div>
    </div>
  )
}
