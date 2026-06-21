import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Send, Sparkles, Clock, AlertCircle, Square, ArrowDown } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { ScrollArea } from '../../components/ui/scroll-area'
import { useErrorStore } from '../../lib/store'
import { getGalide } from '../../lib/ipc/galide-safe'
import { AiShortcutToolbar } from './AiShortcutToolbar'
import { AiMessageBubble } from './AiMessageBubble'
import { useAiConfig, useAiProviders } from '../../lib/ipc/use-ai-task'
import { useAi } from '../../lib/ipc/use-ai'
import { toChatMessages } from './chat-history'

type Provider = 'openai' | 'claude' | 'ollama'

type TaskStatus = 'pending' | 'running' | 'done' | 'error'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  streaming: boolean
  taskId: string | null
  status: TaskStatus | null
  errorText?: string
}

export const AiPanel = (): JSX.Element => {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [provider, setProvider] = useState<Provider>('openai')
  const [busy, setBusy] = useState(false)
  const [activeShortcut, setActiveShortcut] = useState<string | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const activeTaskIdRef = useRef<string | null>(null)
  const pinnedRef = useRef(true)
  const [showJump, setShowJump] = useState(false)
  const config = useAiConfig()
  const providers = useAiProviders()
  const ai = useAi()

  /**
   * 早到事件缓存 — 修复竞态:
   * main 端 enqueue 后 void drain() 立即开始,可能在 ai.generate 的 taskId
   * 经 IPC 往返回到 renderer 之前就发出 running 状态 / 早期 delta。
   * 此时 assistant 消息(带 taskId)尚未加入 messages,listener 的
   * m.taskId===evt.taskId 匹配不到 → 静默丢弃开头内容。
   * 缓存这些早到事件,assistant 消息注册后(setMessages 回填 taskId)回放。
   */
  const pendingDeltas = useRef<Map<string, string[]>>(new Map())
  const pendingStatus = useRef<Map<string, TaskStatus>>(new Map())

  useEffect(() => {
    if (config.data?.provider) setProvider(config.data.provider)
  }, [config.data?.provider])

  // 真正的滚动容器是 Radix Viewport(viewportRef),不是内容 div。
  // pin 策略(对齐 ChatGPT/Claude):只在用户已贴底时自动跟随;
  // 用户往上翻阅时不打断,改显示"回到底部"按钮。
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth'): void => {
    const el = viewportRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }

  useEffect(() => {
    if (pinnedRef.current) scrollToBottom('smooth')
  }, [messages])

  const onViewportScroll = (): void => {
    const el = viewportRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    const pinned = distance < 40
    pinnedRef.current = pinned
    setShowJump(!pinned)
  }

  // composer 自动增高:1 行起,最高 128px 后内滚
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }, [input])

  // Enter 发送 / Shift+Enter 换行;IME 组字中不拦截(中文输入关键)
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (input.trim() && !busy) void send(input)
    }
  }

  const onStop = async (): Promise<void> => {
    const tid = activeTaskIdRef.current
    if (tid) void ai.cancel(tid)
  }

  // Subscribe to status events for any active assistant message
  useEffect(() => {
    const g = getGalide()
    if (!g?.ai?.onStatus) return
    const off = g.ai.onStatus((evt) => {
      const nextStatus = evt.status as TaskStatus
      // 若消息尚未注册(竞态)→ 缓存,等回填 taskId 后回放
      let registered = false
      setMessages((prev) =>
        prev.map((m) => {
          if (m.taskId !== evt.taskId) return m
          registered = true
          const streaming = nextStatus === 'pending' || nextStatus === 'running'
          const patch: Partial<Message> = { status: nextStatus, streaming }
          // 错误单独存 errorText,不拼进 text(否则结束时被 Markdown 当链接渲染)
          if (nextStatus === 'error') {
            patch.errorText = evt.error ?? 'unknown'
            patch.streaming = false
          }
          return { ...m, ...patch }
        })
      )
      if (!registered) {
        pendingStatus.current.set(evt.taskId, nextStatus)
      }
      if (nextStatus === 'done' || nextStatus === 'error') {
        activeTaskIdRef.current = null
        setBusy(false)
      }
    })
    return off
  }, [])

  // Subscribe to stream events for any active assistant message
  useEffect(() => {
    const g = getGalide()
    if (!g?.ai?.stream) return
    const off = g.ai.stream((chunk) => {
      if (!chunk.delta) return
      // 若消息尚未注册(竞态)→ 缓存 delta,等回填 taskId 后回放
      let registered = false
      setMessages((prev) =>
        prev.map((m) => {
          if (m.taskId !== chunk.taskId) return m
          registered = true
          return { ...m, text: m.text + chunk.delta }
        })
      )
      if (!registered) {
        const arr = pendingDeltas.current.get(chunk.taskId) ?? []
        arr.push(chunk.delta)
        pendingDeltas.current.set(chunk.taskId, arr)
      }
    })
    return off
  }, [])

  // 从 stored config 派生 baseUrl/model,跟测试连接走同一组值
  const storedBaseUrl = config.data?.baseUrl
  const storedModel = config.data?.model

  const send = async (text: string): Promise<void> => {
    if (!text.trim() || busy) return
    pinnedRef.current = true
    setShowJump(false)
    // 多轮:用更新前的历史 + 本轮输入打包 messages[](provider 才有上下文记忆)
    const chatMessages = toChatMessages(messages, text)
    const userId = crypto.randomUUID()
    setMessages((m) => [...m, { id: userId, role: 'user', text, streaming: false, taskId: null, status: null }])
    setInput('')
    setActiveShortcut(null)
    const assistantId = crypto.randomUUID()
    setBusy(true)

    try {
      // model/baseUrl 透传:用 stored config(用户在偏好里设的那个)
      // 不传时 main 端会从 aiConfig 读 fallback
      const result = await ai.generate({
        prompt: text,
        messages: chatMessages,
        context:
          '你是 Galide 的 AI 编剧助手,温柔、体贴、懂 galgame。\n' +
          '回复时按以下结构分段,段落之间用空行隔开(直接换行,不要写 \\n 字符):\n' +
          '  1) 一句温暖的回应或开场白(短,1-2 句)\n' +
          '  2) 实际建议/示例剧本片段(用对话或场景描述,自然分段)\n' +
          '  3) 一个引导性问题(让用户继续)\n' +
          '注意:输出正文时用真正的换行分段,绝不输出字面的反斜杠 n。',
        provider,
        model: storedModel,
        baseUrl: storedBaseUrl
      })
      if (!result) {
        setBusy(false)
        return
      }
      const taskId = result.taskId
      activeTaskIdRef.current = taskId
      // 注册 assistant 消息并回放竞态期缓存的早到事件
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
      // 回放缓存的 delta / status(main 端 drain 可能在 taskId 回到 renderer 前已发)
      const cachedDeltas = pendingDeltas.current.get(taskId)
      if (cachedDeltas && cachedDeltas.length > 0) {
        const joined = cachedDeltas.join('')
        setMessages((m) =>
          m.map((mm) => (mm.taskId === taskId ? { ...mm, text: mm.text + joined } : mm))
        )
        pendingDeltas.current.delete(taskId)
      }
      const cachedStatus = pendingStatus.current.get(taskId)
      if (cachedStatus) {
        pendingStatus.current.delete(taskId)
        const streaming = cachedStatus === 'pending' || cachedStatus === 'running'
        const patch: Partial<Message> = { status: cachedStatus, streaming }
        if (cachedStatus === 'error') {
          patch.streaming = false
        }
        setMessages((m) => m.map((mm) => (mm.taskId === taskId ? { ...mm, ...patch } : mm)))
      }
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
          text: '',
          streaming: false,
          taskId: null,
          status: 'error',
          errorText: err instanceof Error ? err.message : String(err)
        }
      ])
      setBusy(false)
    }
  }

  const handleShortcut = (prompt: string, id: string): void => {
    setActiveShortcut(id)
    void send(prompt)
  }

  return (
    <div className="h-full bg-surface flex flex-col">
      <AiShortcutToolbar
        onShortcut={handleShortcut}
        provider={provider}
        onProviderChange={setProvider}
        providers={providers.data ?? []}
        activeShortcut={activeShortcut}
      />
      <ScrollArea
        className="flex-1 bg-canvas"
        viewportRef={viewportRef}
        onViewportScroll={onViewportScroll}
      >
        <div className="p-3 space-y-3">
          {messages.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="开始对话"
              description="输入消息,或选一个快捷动作开始创作"
              className="min-h-[50vh]"
            />
          ) : (
            messages.map((m) => <AiMessageBubbleWithStatus key={m.id} message={m} provider={provider} />)
          )}
        </div>
        {showJump ? (
          <button
            type="button"
            onClick={() => {
              pinnedRef.current = true
              setShowJump(false)
              scrollToBottom('smooth')
            }}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1 h-7 px-3 rounded-full bg-surface border border-border shadow-md text-[11px] text-text-muted hover:text-text transition-colors"
            aria-label="回到底部"
          >
            <ArrowDown className="w-3 h-3" />
            回到底部
          </button>
        ) : null}
      </ScrollArea>
      <div className="border-t border-border p-2">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (input.trim() && !busy) void send(input)
          }}
        >
          <div className="rounded-xl border border-border bg-surface px-2.5 py-1.5 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息…"
              rows={1}
              disabled={busy}
              className="block w-full resize-none bg-transparent text-sm leading-relaxed text-text placeholder:text-text-muted focus:outline-none disabled:opacity-50 max-h-32 overflow-y-auto"
            />
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-text-muted select-none">
                Enter 发送 · Shift+Enter 换行
              </span>
              {busy ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-medium text-text-muted hover:text-text hover:bg-bg-elevated transition-colors"
                  aria-label="停止生成"
                >
                  <Square className="w-3 h-3 fill-current" />
                  停止
                </button>
              ) : (
                <Button
                  type="submit"
                  size="sm"
                  disabled={!input.trim()}
                  aria-label="发送"
                >
                  <Send className="w-3.5 h-3.5" />
                  发送
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

const AiMessageBubbleWithStatus = ({ message, provider }: { message: Message; provider: Provider }): JSX.Element => {
  if (message.role === 'user') {
    return <AiMessageBubble message={message} provider={provider} />
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
      return { icon: <Sparkles className="w-3 h-3 animate-pulse" />, text: '输出中...' }
    }
    return null
  })()
  return (
    <div className="space-y-1">
      <AiMessageBubble message={message} provider={provider} />
      {statusHint && (
        <div className="flex items-center gap-1 pl-8 text-[10px] text-text-muted">
          {statusHint.icon}
          <span>{statusHint.text}</span>
        </div>
      )}
      {message.errorText ? (
        <div className="flex items-start gap-1.5 pl-8 text-[11px] text-danger-strong bg-danger-soft border border-danger/30 rounded-md px-2 py-1.5">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="break-all">{message.errorText}</span>
        </div>
      ) : null}
    </div>
  )
}
