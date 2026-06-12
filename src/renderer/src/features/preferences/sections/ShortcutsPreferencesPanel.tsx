import { useState } from 'react'
import { useShortcuts, useSaveShortcuts, useResetShortcuts } from '../../../lib/ipc/use-preferences'
import { useShortcutRecorder } from '../../../lib/ipc/use-shortcut-recorder'
import { Button } from '../../../components/ui/button'
import { Pencil, RotateCcw } from 'lucide-react'

const SHORTCUT_LIST: { id: string; label: string; default: string }[] = [
  { id: 'commandPalette', label: '命令面板', default: 'Meta+K' },
  { id: 'saveScript', label: '保存剧本', default: 'Meta+S' },
  { id: 'aiInline', label: 'AI 行内编辑', default: 'Meta+K' },
  { id: 'openPreferences', label: '打开偏好', default: 'Meta+,' }
]

export const ShortcutsPreferencesPanel = (): JSX.Element => {
  const query = useShortcuts()
  const save = useSaveShortcuts()
  const reset = useResetShortcuts()
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const recorder = useShortcutRecorder((acc) => {
    if (!recordingId || !query.data) return
    const next = { ...query.data, [recordingId]: acc }
    void save.mutateAsync(next)
    setRecordingId(null)
  })

  const start = (id: string): void => {
    setRecordingId(id)
    recorder.setRecording(true)
  }

  const onReset = (): void => {
    void reset.mutate()
  }

  if (!query.data) return <div className="text-sm text-text-muted">加载中…</div>

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold mb-1">快捷键</h2>
          <p className="text-sm text-text-muted">点击右侧录制按钮,按下新组合键。</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw className="w-3.5 h-3.5 mr-1" />
          全部重置
        </Button>
      </div>
      <div className="border border-border rounded-2xl bg-surface divide-y divide-border">
        {SHORTCUT_LIST.map((s) => {
          const current = query.data[s.id] ?? s.default
          const isRecording = recordingId === s.id
          return (
            <div key={s.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm">{s.label}</span>
              <div className="flex items-center gap-2">
                <div
                  className={`px-3 py-1.5 text-xs font-mono rounded-md border ${
                    isRecording
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-border bg-bg text-text'
                  }`}
                >
                  {isRecording ? '按下组合键…' : current}
                </div>
                <Button variant="ghost" size="icon" onClick={() => start(s.id)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
