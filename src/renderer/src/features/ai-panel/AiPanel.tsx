import { useEffect, useRef, useState } from 'react'
import { X, Send, Sparkles, Clock } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { ScrollArea } from '../../components/ui/scroll-area'
import { useUiStore } from '../../lib/store'
import { useErrorStore } from '../../lib/store'
import { AiShortcutToolbar } from './AiShortcutToolbar'
import { AiMessageBubble } from './AiMessageBubble'
import { useAiConfig, useAiProviders } from '../../lib/ipc/use-ai-task'
import { useAi } from '../../lib/ipc/use-ai'

type Provider = 'openai' | 'claude' | 'ollama'

type TaskStatus = 'pending' | 'running' | 'done' | 'error'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  streaming: boolean
  taskId: string | null
  status: TaskStatus | null
}

export const AiPanel = (): JSX.Element => {
  const toggleAi = useUiStore((s) => s.toggleAiPanel)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [provider, setProvider] = useState<Provider>('openai')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const config = useAiConfig()
  const providers = useAiProviders()
  const ai = useAi()

  useEffect(() => {
    if (config.data?.provider) setProvider(config.data.provider)
  }, [config.data?.provider])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 999999, behavior: 'smooth' })
  }, [messages])

  // Subscribe to status events for any active assistant message
  useEffect(() => {
    const off = window.galide.ai.onStatus((evt) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.taskId !== evt.taskId) return m
          const nextStatus = evt.status as TaskStatus
          const streaming = nextStatus === 'pending' || nextStatus === 'running'
          let text = m.text
          if (nextStatus === 'error') {
            text = m.text ? `${m.text}\n[error: ${evt.error ?? 'unknown'}]` : `[error: ${evt.error ?? 'unknown'}]`
          }
          return { ...m, status: nextStatus, streaming, text }
        })
      )
      if (evt.status === 'done' || evt.status === 'error') {
        // P1-7 修复: 原版 `setBusy((b) => (b ? false : b))` 永远写 false 但绕了一下,
        // 改为显式。listener 在 AiPanel 卸载时由 useEffect cleanup 移除(无累积)。
        setBusy(false)
      }
    })
    return off
  }, [])

  // Subscribe to stream events for any active assistant message
  useEffect(() => {
    const off = window.galide.ai.stream((chunk) => {
      if (!chunk.delta) return
      setMessages((prev) =>
        prev.map((m) => (m.taskId === chunk.taskId ? { ...m, text: m.text + chunk.delta } : m))
      )
    })
    return off
  }, [])

  // 从 stored config 派生 baseUrl/model,跟测试连接走同一组值
  const storedBaseUrl = config.data?.baseUrl
  const storedModel = config.data?.model

  const send = async (text: string): Promise<void> => {
    if (!text.trim() || busy) return
    const userId = crypto.randomUUID()
    setMessages((m) => [...m, { id: userId, role: 'user', text, streaming: false, taskId: null, status: null }])
    setInput('')
    const assistantId = crypto.randomUUID()
    setBusy(true)

    try {
      // model/baseUrl 透传:用 stored config(用户在偏好里设的那个)
      // 不传时 main 端会从 aiConfig 读 fallback
      const result = await ai.generate({
        prompt: text,
        context:
          '你是 Galide 的 AI 编剧助手,温柔、体贴、懂 galgame。\n' +
          '回复时按以下结构分段(用空行 \\n\\n 隔开):\n' +
          '  1) 一句温暖的回应或开场白(短,1-2 句)\n' +
          '  2) 实际建议/示例剧本片段(用对话或场景描述,自然分段)\n' +
          '  3) 一个引导性问题(让用户继续)\n' +
          '段落之间必须有 \\n\\n,不要堆在一起。',
        provider,
        model: storedModel,
        baseUrl: storedBaseUrl
      })
      if (!result) {
        setBusy(false)
        return
      }
      const taskId = result.taskId
      setMessages((m) => [
        ...m,
        {
          id: assistantId,
          role: 'assistant',
          text: '',
          streaming: true,
          taskId,
          status: 'pending'
        }
      ])
    } catch (err) {
      useErrorStore.getState().push({
        code: 'IPC_ERROR',
        message: err instanceof Error ? err.message : String(err),
        source: 'ai:generate'
      })
      setMessages((m) => [
        ...m,
        {
          id: assistantId,
          role: 'assistant',
          text: `[error: ${err instanceof Error ? err.message : String(err)}]`,
          streaming: false,
          taskId: null,
          status: 'error'
        }
      ])
      setBusy(false)
    }
  }

  const handleShortcut = (prompt: string): void => {
    void send(prompt)
  }

  return (
    <aside className="w-96 bg-surface border-l border-border flex flex-col shrink-0">
      <div className="h-10 px-3 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium">AI 助手</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => toggleAi(false)}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      <AiShortcutToolbar
        onShortcut={handleShortcut}
        provider={provider}
        onProviderChange={setProvider}
        providers={providers.data ?? []}
      />
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-3 space-y-2">
          {messages.length === 0 ? (
            <div className="text-center py-8 text-xs text-text-muted">
              <Sparkles className="w-6 h-6 mx-auto mb-2 opacity-30" />
              开始对话,或选一个快捷动作
            </div>
          ) : (
            messages.map((m) => <AiMessageBubbleWithStatus key={m.id} message={m} />)
          )}
        </div>
      </ScrollArea>
      <div className="border-t border-border p-2">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send(input)
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息..."
            className="flex-1"
            disabled={busy}
          />
          <Button type="submit" size="icon" disabled={!input.trim() || busy}>
            <Send className="w-3.5 h-3.5" />
          </Button>
        </form>
      </div>
    </aside>
  )
}

const AiMessageBubbleWithStatus = ({ message }: { message: Message }): JSX.Element => {
  if (message.role === 'user') {
    return <AiMessageBubble message={message} />
  }
  // 状态文案:
  //  - pending:任务入队,等 provider 握手 → "连接中..."
  //  - running:provider 已发首个 token,正在流 → "输出中..."
  //  - done / error:不显示
  const statusHint = ((): { icon: JSX.Element; text: string } | null => {
    if (message.status === 'pending') {
      return { icon: <Clock className="w-3 h-3" />, text: '连接中...' }
    }
    if (message.status === 'running') {
      return { icon: <Sparkles className="w-3 h-3" />, text: '输出中...' }
    }
    return null
  })()
  return (
    <div className="space-y-1">
      <AiMessageBubble message={message} />
      {statusHint && (
        <div className="flex items-center gap-1 pl-8 text-[10px] text-text-muted">
          {statusHint.icon}
          <span>{statusHint.text}</span>
        </div>
      )}
    </div>
  )
}