import { usePreference, useSavePreference } from '../../../lib/ipc/use-preferences'
import { PreferenceEditor } from '../components/PreferenceEditor'
import { Input } from '../../../components/ui/input'
import type { ProjectPreferences } from '@shared/preferences'

export const ProjectPreferencesPanel = (): JSX.Element => {
  const query = usePreference('project')
  const save = useSavePreference('project')
  const draft = query.data as ProjectPreferences | undefined
  const update = (next: ProjectPreferences): Promise<unknown> => save.mutateAsync(next)

  if (!draft) return <div className="text-sm text-text-muted">加载中…</div>

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">项目</h2>
        <p className="text-sm text-text-muted mb-4">项目相关默认行为。</p>
        <div className="border border-border rounded-2xl p-4 bg-surface divide-y divide-border">
          <PreferenceEditor
            label="最近项目上限"
            description="超过此数自动淘汰最早打开的"
            control={
              <Input
                type="number"
                value={draft.recentLimit}
                onChange={(e) => void update({ ...draft, recentLimit: Number(e.target.value) })}
                className="w-20"
                min={1}
                max={50}
              />
            }
          />
          <PreferenceEditor
            label="默认项目模板路径"
            description="留空则每次新建项目从空白开始"
            control={
              <Input
                value={draft.defaultTemplate}
                onChange={(e) => void update({ ...draft, defaultTemplate: e.target.value })}
                className="w-96"
                placeholder="/path/to/template"
              />
            }
          />
        </div>
      </div>
    </div>
  )
}
