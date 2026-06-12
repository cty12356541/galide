import { usePreference, useSavePreference } from '../../../lib/ipc/use-preferences'
import { PreferenceEditor } from '../components/PreferenceEditor'
import { Input } from '../../../components/ui/input'
import { ToggleEditor } from '../components/ToggleEditor'
import type { GitPreferences } from '@shared/preferences'

export const GitPreferencesPanel = (): JSX.Element => {
  const query = usePreference('git')
  const save = useSavePreference('git')
  const draft = query.data as GitPreferences | undefined
  const update = (next: GitPreferences): Promise<unknown> => save.mutateAsync(next)

  if (!draft) return <div className="text-sm text-text-muted">加载中…</div>

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">Git</h2>
        <p className="text-sm text-text-muted mb-4">自动 Git 初始化和提交策略。</p>
        <div className="border border-border rounded-2xl p-4 bg-surface divide-y divide-border">
          <PreferenceEditor
            label="新建项目自动 git init"
            control={
              <ToggleEditor
                checked={draft.autoInit}
                onChange={(v) => void update({ ...draft, autoInit: v })}
              />
            }
          />
          <PreferenceEditor
            label="保存时自动 commit"
            control={
              <ToggleEditor
                checked={draft.autoCommitOnSave}
                onChange={(v) => void update({ ...draft, autoCommitOnSave: v })}
              />
            }
          />
          <PreferenceEditor
            label="默认作者名"
            control={
              <Input
                value={draft.defaultAuthorName}
                onChange={(e) => void update({ ...draft, defaultAuthorName: e.target.value })}
                className="w-64"
              />
            }
          />
          <PreferenceEditor
            label="默认作者邮箱"
            control={
              <Input
                value={draft.defaultAuthorEmail}
                onChange={(e) => void update({ ...draft, defaultAuthorEmail: e.target.value })}
                className="w-64"
              />
            }
          />
          <PreferenceEditor
            label="初始 commit 信息"
            control={
              <Input
                value={draft.initialCommitMessage}
                onChange={(e) => void update({ ...draft, initialCommitMessage: e.target.value })}
                className="w-96"
              />
            }
          />
        </div>
      </div>
    </div>
  )
}
