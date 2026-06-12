import { motion } from 'framer-motion'
import { Sparkles, ArrowRight, RefreshCw, Wand2, Languages, X } from 'lucide-react'
import { useState } from 'react'
import { useAiStream } from '../../lib/ipc/use-ai'

type AiAction = 'continue' | 'rewrite' | 'polish' | 'translate'

const ACTIONS: { id: AiAction; label: string; icon: typeof Sparkles }[] = [
  { id: 'continue', label: '续写', icon: ArrowRight },
  { id: 'rewrite', label: '改写', icon: RefreshCw },
  { id: 'polish', label: '润色', icon: Wand2 },
  { id: 'translate', label: '翻译', icon: Languages }
]

export const AiInlineEdit = ({
  onClose,
  content
}: {
  onClose: () => void
  content: string
}): JSX.Element => {
  const [loading, setLoading] = useState<AiAction | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const stream = useAiStream(taskId)

  const handleAction = async (action: AiAction): Promise<void> => {
    setLoading(action)
    setErrorMsg(null)
    setTaskId(null)
    try {
      const lastLine = content.split('\n').filter((l) => l.trim()).slice(-3).join('\n')
      const response = await window.galide.ai.generate({
        prompt: `[${action}] ${lastLine}`,
        context:
          '你是 galgame 剧本作家,延续文字游戏风格的自然对话。\n' +
          '输出格式:用空行 \\n\\n 分段(开场白 / 实际剧本 / 引导性提问)。',
        provider: 'openai'
      })
      // generate 立即返回 { taskId, status: 'pending' };实际文本由 useAiStream 订阅 ai:stream 累积
      if (response) setTaskId(response.taskId)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(null)
    }
  }

  const result = stream.text || (stream.error ? `错误: ${stream.error}` : errorMsg ? `错误: ${errorMsg}` : '')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="absolute top-3 right-3 w-80 bg-surface border border-border rounded-2xl shadow-lg overflow-hidden z-10"
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-bg-elevated">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium">AI 动作</span>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1 p-2 border-b border-border">
        {ACTIONS.map((a) => {
          const Icon = a.icon
          return (
            <button
              key={a.id}
              onClick={() => void handleAction(a.id)}
              disabled={loading !== null}
              className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-bg-elevated disabled:opacity-50 transition-colors"
            >
              <Icon className="w-4 h-4 text-text-muted" />
              <span className="text-[11px]">{a.label}</span>
            </button>
          )
        })}
      </div>
      <div className="p-3 min-h-[80px] max-h-48 overflow-y-auto">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <RefreshCw className="w-3 h-3 animate-spin" />
            生成中…
          </div>
        ) : result ? (
          <div className="text-xs text-text leading-relaxed whitespace-pre-wrap">{result}</div>
        ) : (
          <div className="text-xs text-text-muted">选择上方动作以生成内容</div>
        )}
      </div>
    </motion.div>
  )
}
