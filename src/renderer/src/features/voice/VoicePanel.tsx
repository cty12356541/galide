import { useEffect, useState, useCallback } from 'react'
import { Volume2, Play, Trash2, RefreshCw, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { ScrollArea } from '../../components/ui/scroll-area'
import { useUiStore } from '../../lib/store'
import { useVoice } from '../../lib/ipc/use-voice'
import { useErrorStore } from '../../lib/store'
import { toast } from '../../components/ui/toast'
import { cn } from '../../lib/utils'

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
 * 当前状态: 列出 assets/voice 下的 .mp3,允许试听 / 删除 / 基于选中对白重生成。
 * 由于 tts-proxy 仍是 NOT_IMPLEMENTED 占位,UI 仍然能完整呈现"已生成的资产"
 * 列表语义,生成时也会如实反馈占位错误(不静默吞)。
 */
export const VoicePanel = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const voice = useVoice()
  const pushError = useErrorStore((s) => s.push)
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
      <div className="h-9 px-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">语音</span>
          <span className="text-[10px] text-text-muted">({items.length})</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void refresh()}
          title="刷新"
          className="h-6 w-6"
        >
          <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
        </Button>
      </div>
      <ScrollArea className="max-h-40">
        <div className="px-1.5 pb-1.5 space-y-0.5">
          {items.length === 0 ? (
            <div className="text-[11px] text-text-muted px-2 py-1.5">
              尚未生成语音。
              <br />
              <span className="text-text-muted/70">
                在偏好 → 语音 配置默认 TTS 提供商。
              </span>
            </div>
          ) : (
            items.map((it) => {
              const isGen = generating === it.id
              const isPlay = playing === it.id
              return (
                <div
                  key={it.id}
                  className="group flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-bg-elevated"
                >
                  <button
                    onClick={() => handlePlay(it)}
                    disabled={!it.audioPath}
                    className="shrink-0 p-1 rounded text-text-muted hover:text-accent disabled:opacity-40"
                    title={isPlay ? '播放中…' : '试听'}
                  >
                    {isPlay ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-mono truncate">{it.id}.mp3</div>
                    {it.text && (
                      <div className="text-[10px] text-text-muted truncate">
                        {it.text}
                      </div>
                    )}
                  </div>
                  {isGen ? (
                    <Loader2 className="w-3 h-3 animate-spin text-text-muted" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => void handleRegenerate(it)}
                      title="重新生成"
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
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-500"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              )
            })
          )}
          {items.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-amber-600">
              <AlertCircle className="w-2.5 h-2.5" />
              <span>重新生成取决于 TTS 提供商是否实现</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
