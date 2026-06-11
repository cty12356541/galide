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
        setBusy((b) => (b ? false : b))
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

  const send = async (text: string): Promise<void> => {
    if (!text.trim() || busy) return
    const userId = crypto.randomUUID()
    setMessages((m) => [...m, { id: userId, role: 'user', text, streaming: false, taskId: null, status: null }])
    setInput('')
    const assistantId = crypto.randomUUID()
    setBusy(true)

    try {
      const result = await ai.generate({
        prompt: text,
        context: '你是 Galide 的 AI 助手,帮助用户创作 galgame 剧本。',
        provider
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
  return (
    <div className="space-y-1">
      <AiMessageBubble message={message} />
      {message.status === 'pending' && (
        <div className="flex items-center gap-1 pl-8 text-[10px] text-text-muted">
          <Clock className="w-3 h-3" />
          <span>排队中...</span>
        </div>
      )}
    </div>
  )
}