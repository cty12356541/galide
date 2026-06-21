import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePreference, useSavePreference } from '../../../lib/ipc/use-preferences'
import { PreferenceEditor } from '../components/PreferenceEditor'
import { ApiKeyEditor } from '../components/ApiKeyEditor'
import { Input } from '../../../components/ui/input'
import { useAiConfigForm } from '../../../lib/ipc/use-ai-config-form'
import type { VoicePreferences } from '@shared/preferences'

const ELEVENLABS_KEY_PROVIDER = 'elevenlabs' as const

export const VoicePreferencesPanel = (): JSX.Element => {
  const query = usePreference('voice')
  const save = useSavePreference('voice')
  const draft = query.data as VoicePreferences | undefined
  const update = (next: VoicePreferences): Promise<unknown> => save.mutateAsync(next)
  const form = useAiConfigForm()
  const qc = useQueryClient()

  const keyQuery = useQuery({
    queryKey: ['api-key', ELEVENLABS_KEY_PROVIDER],
    queryFn: () => window.galide.ai.keyHas(ELEVENLABS_KEY_PROVIDER)
  })

  const hasElevenLabsKey =
    form.hasKeySync(ELEVENLABS_KEY_PROVIDER) || keyQuery.data === true

  const handleKeySaved = async (key: string): Promise<boolean> => {
    const ok = await form.setKey(ELEVENLABS_KEY_PROVIDER, key)
    if (ok) {
      qc.invalidateQueries({ queryKey: ['api-key', ELEVENLABS_KEY_PROVIDER] })
    }
    return ok
  }

  const handleKeyDeleted = async (): Promise<boolean> => {
    const ok = await form.deleteKey(ELEVENLABS_KEY_PROVIDER)
    if (ok) {
      qc.invalidateQueries({ queryKey: ['api-key', ELEVENLABS_KEY_PROVIDER] })
    }
    return ok
  }

  if (!draft) return <div className="text-sm text-text-muted">加载中…</div>

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">语音 / TTS</h2>
        <p className="text-sm text-text-muted mb-4">配置默认语音合成提供商和批量生成参数。</p>
        <div className="border border-border rounded-2xl p-4 bg-surface divide-y divide-border">
          <PreferenceEditor
            label="默认 TTS 提供商"
            control={
              <select
                value={draft.defaultProvider}
                onChange={(e) => void update({ ...draft, defaultProvider: e.target.value as VoicePreferences['defaultProvider'] })}
                className="h-9 px-3 rounded-lg border border-border bg-bg text-sm"
              >
                <option value="edge">Edge TTS (免费)</option>
                <option value="elevenlabs">ElevenLabs</option>
                <option value="local">本地</option>
              </select>
            }
          />
          <PreferenceEditor
            label="默认音色 ID"
            control={
              <Input
                value={draft.defaultVoiceId}
                onChange={(e) => void update({ ...draft, defaultVoiceId: e.target.value })}
                className="w-64"
              />
            }
          />
          <PreferenceEditor
            label="批量生成并发数"
            control={
              <Input
                type="number"
                value={draft.batchConcurrency}
                onChange={(e) => void update({ ...draft, batchConcurrency: Number(e.target.value) })}
                className="w-24"
                min={1}
                max={16}
              />
            }
          />
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold mb-1">ElevenLabs API Key</h3>
        <p className="text-sm text-text-muted mb-4">
          使用 ElevenLabs TTS 时需要 API Key。Key 保存在本地加密存储,不会暴露给渲染层。
        </p>
        <div className="border border-border rounded-2xl p-4 bg-surface">
          <PreferenceEditor
            label="API Key"
            description={hasElevenLabsKey ? '已保存。删除后将清空。' : '粘贴 ElevenLabs 的 API Key'}
            vertical
            control={
              <ApiKeyEditor
                hasKey={hasElevenLabsKey}
                onSave={handleKeySaved}
                onDelete={handleKeyDeleted}
              />
            }
          />
        </div>
      </div>
    </div>
  )
}
