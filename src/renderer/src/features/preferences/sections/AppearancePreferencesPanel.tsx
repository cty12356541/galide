import { usePreference, useSavePreference } from '../../../lib/ipc/use-preferences'
import { PreferenceEditor } from '../components/PreferenceEditor'
import { Input } from '../../../components/ui/input'
import { ToggleEditor } from '../components/ToggleEditor'
import { useUiStore } from '../../../lib/store'
import type { AppearancePreferences } from '@shared/preferences'

const ACCENT_OPTIONS: AppearancePreferences['accent'][] = ['violet', 'blue', 'rose', 'emerald']

export const AppearancePreferencesPanel = (): JSX.Element => {
  const query = usePreference('appearance')
  const save = useSavePreference('appearance')
  const draft = query.data as AppearancePreferences | undefined
  const update = (next: AppearancePreferences): Promise<unknown> => save.mutateAsync(next)
  const setTheme = useUiStore((s) => s.setTheme)

  if (!draft) return <div className="text-sm text-text-muted">加载中…</div>

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">外观</h2>
        <p className="text-sm text-text-muted mb-4">主题、主色、字体与动画。</p>
        <div className="border border-border rounded-2xl p-4 bg-surface divide-y divide-border">
          <PreferenceEditor
            label="主题"
            description="浅色或深色"
            control={
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTheme('light')}
                  className="px-3 py-1.5 text-xs rounded-lg border border-border bg-bg hover:border-accent"
                >
                  浅色
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className="px-3 py-1.5 text-xs rounded-lg border border-border bg-bg-elevated hover:border-accent"
                >
                  深色
                </button>
              </div>
            }
          />
          <PreferenceEditor
            label="主色"
            control={
              <select
                value={draft.accent}
                onChange={(e) => void update({ ...draft, accent: e.target.value as AppearancePreferences['accent'] })}
                className="h-9 px-3 rounded-lg border border-border bg-bg text-sm"
              >
                {ACCENT_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            }
          />
          <PreferenceEditor
            label="正文字体"
            control={
              <Input
                value={draft.fontSans}
                onChange={(e) => void update({ ...draft, fontSans: e.target.value })}
                className="w-48"
              />
            }
          />
          <PreferenceEditor
            label="等宽字体"
            control={
              <Input
                value={draft.fontMono}
                onChange={(e) => void update({ ...draft, fontMono: e.target.value })}
                className="w-48"
              />
            }
          />
          <PreferenceEditor
            label="减少动画"
            control={
              <ToggleEditor
                checked={draft.reducedMotion}
                onChange={(v) => void update({ ...draft, reducedMotion: v })}
              />
            }
          />
        </div>
      </div>
    </div>
  )
}
