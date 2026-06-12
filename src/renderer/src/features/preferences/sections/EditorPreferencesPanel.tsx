import { usePreference, useSavePreference } from '../../../lib/ipc/use-preferences'
import { PreferenceEditor } from '../components/PreferenceEditor'
import { Input } from '../../../components/ui/input'
import { ToggleEditor } from '../components/ToggleEditor'
import type { EditorPreferences } from '@shared/preferences'

export const EditorPreferencesPanel = (): JSX.Element => {
  const query = usePreference('editor')
  const save = useSavePreference('editor')
  const draft = query.data as EditorPreferences | undefined
  const update = (next: EditorPreferences): Promise<unknown> => save.mutateAsync(next)

  if (!draft) return <div className="text-sm text-text-muted">加载中…</div>

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">编辑器</h2>
        <p className="text-sm text-text-muted mb-4">剧本编辑器的视觉与行为偏好。</p>
        <div className="border border-border rounded-2xl p-4 bg-surface divide-y divide-border">
          <PreferenceEditor
            label="字体大小"
            control={
              <Input
                type="number"
                value={draft.fontSize}
                onChange={(e) => void update({ ...draft, fontSize: Number(e.target.value) })}
                className="w-20"
                min={10}
                max={24}
              />
            }
          />
          <PreferenceEditor
            label="Tab 大小"
            control={
              <Input
                type="number"
                value={draft.tabSize}
                onChange={(e) => void update({ ...draft, tabSize: Number(e.target.value) })}
                className="w-20"
                min={2}
                max={8}
              />
            }
          />
          <PreferenceEditor
            label="自动换行"
            control={
              <ToggleEditor
                checked={draft.wordWrap}
                onChange={(v) => void update({ ...draft, wordWrap: v })}
              />
            }
          />
          <PreferenceEditor
            label="显示行号"
            control={
              <ToggleEditor
                checked={draft.lineNumbers}
                onChange={(v) => void update({ ...draft, lineNumbers: v })}
              />
            }
          />
          <PreferenceEditor
            label="显示 minimap"
            control={
              <ToggleEditor
                checked={draft.minimap}
                onChange={(v) => void update({ ...draft, minimap: v })}
              />
            }
          />
        </div>
      </div>
    </div>
  )
}
