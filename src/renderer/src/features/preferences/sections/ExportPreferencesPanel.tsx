import { usePreference, useSavePreference } from '../../../lib/ipc/use-preferences'
import { PreferenceEditor } from '../components/PreferenceEditor'
import { Input } from '../../../components/ui/input'
import { ToggleEditor } from '../components/ToggleEditor'
import type { ExportPreferences } from '@shared/preferences'

export const ExportPreferencesPanel = (): JSX.Element => {
  const query = usePreference('export')
  const save = useSavePreference('export')
  const draft = query.data as ExportPreferences | undefined
  const update = (next: ExportPreferences): Promise<unknown> => save.mutateAsync(next)

  if (!draft) return <div className="text-sm text-text-muted">加载中…</div>

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">导出</h2>
        <p className="text-sm text-text-muted mb-4">默认的导出目标、输出目录、是否包含资产。</p>
        <div className="border border-border rounded-2xl p-4 bg-surface divide-y divide-border">
          <PreferenceEditor
            label="默认导出目标"
            control={
              <select
                value={draft.defaultTarget}
                onChange={(e) => void update({ ...draft, defaultTarget: e.target.value as ExportPreferences['defaultTarget'] })}
                className="h-9 px-3 rounded-lg border border-border bg-bg text-sm"
              >
                <option value="web">Web (单 HTML)</option>
                <option value="renpy">Ren'Py</option>
                <option value="ink">Ink</option>
                <option value="json">JSON</option>
                <option value="electron-desktop">Electron Desktop</option>
              </select>
            }
          />
          <PreferenceEditor
            label="默认输出目录"
            description="留空则每次导出时选择"
            control={
              <Input
                value={draft.defaultOutputDir}
                onChange={(e) => void update({ ...draft, defaultOutputDir: e.target.value })}
                className="w-96"
                placeholder="/Users/me/exports"
              />
            }
          />
          <PreferenceEditor
            label="包含资产"
            description="导出时打包图片/音频"
            control={
              <ToggleEditor
                checked={draft.includeAssets}
                onChange={(v) => void update({ ...draft, includeAssets: v })}
              />
            }
          />
        </div>
      </div>
    </div>
  )
}
