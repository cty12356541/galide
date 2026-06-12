import { useEffect } from 'react'
import { PreferenceEditor } from '../components/PreferenceEditor'
import { ToggleEditor } from '../components/ToggleEditor'
import { Button } from '../../../components/ui/button'
import {
  usePreference,
  useSavePreference,
  useResetAllPreferences,
  useCacheDir,
  useClearCache
} from '../../../lib/ipc/use-preferences'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '../../../components/ui/toast'
import { Trash2, RotateCcw, Loader2 } from 'lucide-react'
import type { AdvancedPreferences } from '@shared/preferences'

export const AdvancedPreferencesPanel = (): JSX.Element => {
  const qc = useQueryClient()
  const query = usePreference('advanced')
  const save = useSavePreference('advanced')
  const resetAll = useResetAllPreferences()
  const cacheDirQuery = useCacheDir()
  const clearCacheMut = useClearCache()
  const draft = query.data as AdvancedPreferences | undefined
  const update = (next: AdvancedPreferences): Promise<unknown> => save.mutateAsync(next)

  // 把 main 端真实路径回填到 draft.cacheDir(用户首次打开面板时 sync 一次)
  useEffect(() => {
    if (cacheDirQuery.data && draft && draft.cacheDir !== cacheDirQuery.data) {
      void update({ ...draft, cacheDir: cacheDirQuery.data })
    }
  }, [cacheDirQuery.data, draft, update])

  if (!draft) return <div className="text-sm text-text-muted">加载中…</div>

  const onReset = async (): Promise<void> => {
    await resetAll.mutateAsync()
    qc.invalidateQueries({ queryKey: ['preferences'] })
    toast({ message: '已重置全部偏好', variant: 'success' })
  }

  const clearCache = async (): Promise<void> => {
    const r = await clearCacheMut.mutateAsync()
    if (r.ok) {
      toast({
        message: r.removed > 0 ? `已清理 ${r.removed} 个缓存项` : '缓存目录为空',
        variant: 'success'
      })
    } else {
      toast({ message: `清理失败: ${r.error ?? 'unknown'}`, variant: 'error' })
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">高级</h2>
        <p className="text-sm text-text-muted mb-4">实验功能、遥测、缓存管理、重置选项。</p>
        <div className="border border-border rounded-2xl p-4 bg-surface divide-y divide-border">
          <PreferenceEditor
            label="遥测"
            description="发送匿名使用统计,帮助改进产品"
            control={
              <ToggleEditor
                checked={draft.telemetry}
                onChange={(v) => void update({ ...draft, telemetry: v })}
              />
            }
          />
          <PreferenceEditor
            label="实验功能"
            description="启用尚未稳定的开发中功能"
            control={
              <ToggleEditor
                checked={draft.experimental}
                onChange={(v) => void update({ ...draft, experimental: v })}
              />
            }
          />
          <PreferenceEditor
            label="缓存目录"
            description={cacheDirQuery.isLoading ? '加载中…' : '默认 <userData>/cache/galide'}
            control={
              <input
                value={draft.cacheDir}
                onChange={(e) => void update({ ...draft, cacheDir: e.target.value })}
                className="h-9 px-3 rounded-lg border border-border bg-bg text-sm w-96 font-mono"
                placeholder="留空使用默认"
              />
            }
          />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button variant="secondary" onClick={() => void clearCache()} disabled={clearCacheMut.isPending}>
            {clearCacheMut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5 mr-1" />
            )}
            清理缓存
          </Button>
          <Button variant="destructive" onClick={() => void onReset()}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            重置全部偏好
          </Button>
        </div>
      </div>
    </div>
  )
}
