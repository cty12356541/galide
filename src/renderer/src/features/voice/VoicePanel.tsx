import { useEffect, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Volume2, Play, Trash2, RefreshCw, Mic } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { ScrollArea } from '../../components/ui/scroll-area'
import { PanelHeader } from '../../components/ui/panel-header'
import { EmptyState } from '../../components/ui/empty-state'
import { useUiStore } from '../../lib/store'
import { useVoice } from '../../lib/ipc/use-voice'
import { usePreference } from '../../lib/ipc/use-preferences'
import { useErrorStore } from '../../lib/store'
import { toast } from '../../components/ui/toast'
import { cn } from '../../lib/utils'
import { isTtsUnavailable, ttsUnavailableReason } from './tts-availability'
import type { VoicePreferences } from '@shared/preferences'

const ELEVENLABS_KEY_PROVIDER = 'elevenlabs' as const

type VoiceItem = {
  id: string
  text: string
  audioPath?: string
  characterId: string
}

/**
 * 语音管理面板
 *
 * 规约:
 * - core/naming.yaml: "语音 / TTS"
 * - .style-spec/layers/main-process/conventions.yaml: "AI 任务入队,UI 显示排队状态"
 *
 * 当前状态: 列出 assets/voice 下的 .mp3,允许试听 / 删除 / 基于对白重生成(需条目含 text)。
 */
export const VoicePanel = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const voice = useVoice()
  const pushError = useErrorStore((s) => s.push)
  const voicePrefQuery = usePreference('voice')
  const voicePrefs = voicePrefQuery.data as VoicePreferences | undefined
  const keyQuery = useQuery({
    queryKey: ['api-key', ELEVENLABS_KEY_PROVIDER],
    queryFn: () => window.galide.ai.keyHas(ELEVENLABS_KEY_PROVIDER)
  })
  const hasElevenLabsKey = keyQuery.data === true
  const ttsBlocked = isTtsUnavailable(voicePrefs?.defaultProvider, hasElevenLabsKey)
  const ttsBlockReason = ttsUnavailableReason(voicePrefs?.defaultProvider, hasElevenLabsKey)
  const [items, setItems] = useState<VoiceItem[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!projectPath) {
      setItems([])
      return
    }
    setLoading(true)
    try {
      const r = await voice.list(projectPath)
      setItems(r?.items ?? [])
    } finally {
      setLoading(false)
    }
  }, [projectPath, voice])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handlePlay = (item: VoiceItem): void => {
    if (!item.audioPath) return
    setPlaying(item.id)
    // 通过 main 端暴露的资产路径播放(相对项目根)
    const audio = new Audio(`file://${item.audioPath}`)
    audio.onended = () => setPlaying((p) => (p === item.id ? null : p))
    audio.onerror = () => {
      setPlaying((p) => (p === item.id ? null : p))
      pushError({
        code: 'VOICE_PLAY_FAILED',
        message: '播放失败(文件可能缺失)',
        source: 'voice:play'
      })
    }
    void audio.play()
  }

  const handleDelete = async (id: string): Promise<void> => {
    if (!projectPath) return
    if (!window.confirm(`删除语音 ${id}.mp3?`)) return
    const r = await voice.delete(projectPath, id)
    if (!r?.ok) {
      pushError({
        code: 'VOICE_DELETE_FAILED',
        message: r?.error ?? 'unknown',
        source: 'voice:delete'
      })
      return
    }
    await refresh()
    toast({ message: `已删除 ${id}`, variant: 'success' })
  }

  const handleRegenerate = async (item: VoiceItem): Promise<void> => {
    if (!projectPath) return
    if (!item.text.trim()) {
      pushError({
        code: 'VOICE_NO_TEXT',
        message: '该语音条目缺少对白文本,无法重新生成',
        source: 'voice:generate'
      })
      return
    }
    setGenerating(item.id)
    try {
      const r = await voice.generate(projectPath, item.id, item.text, item.characterId)
      if (!r?.ok) {
        pushError({
          code: 'VOICE_GENERATE_FAILED',
          message: r?.error ?? 'unknown',
          source: 'voice:generate'
        })
        return
      }
      await refresh()
      toast({ message: `已生成 ${item.id}.mp3`, variant: 'success' })
    } finally {
      setGenerating(null)
    }
  }

  if (!projectPath) return <div />

  return (
    <div className="border-b border-border">
      <PanelHeader
        title="语音"
        icon={Volume2}
        subtitle={items.length}
        size="md"
        actions={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void refresh()}
            title="刷新"
            className="h-7 w-7"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </Button>
        }
      />
      <ScrollArea className="max-h-40">
        <div className="px-1.5 pb-1.5 space-y-0.5">
          {items.length === 0 ? (
            <EmptyState
              icon={Mic}
              title="尚未生成语音"
              description="在偏好 → 语音 配置默认 TTS 提供商"
              className="py-4 px-3"
            />
          ) : (
            items.map((it) => (
              <div
                key={it.id}
                className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-elevated"
              >
                <button
                  type="button"
                  onClick={() => handlePlay(it)}
                  className="h-6 w-6 rounded-md flex items-center justify-center text-text-muted hover:text-accent transition-colors"
                  title="试听"
                >
                  <Play className={cn('w-3 h-3', playing === it.id && 'text-accent')} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] truncate">{it.id}</div>
                  <div className="text-[10px] text-text-muted truncate">{it.text}</div>
                </div>
                {generating === it.id ? (
                  <RefreshCw className="w-3 h-3 animate-spin text-text-muted" />
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleRegenerate(it)}
                    title={
                      ttsBlocked
                        ? ttsBlockReason
                        : !it.text.trim()
                          ? '缺少对白文本,无法重新生成'
                          : '重新生成'
                    }
                    disabled={ttsBlocked || !it.text.trim()}
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void handleDelete(it.id)}
                  title="删除"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))
          )}
          {items.length > 0 && ttsBlocked && (
            <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-warning-strong">
              <span>{ttsBlockReason}</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
