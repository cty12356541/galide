import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Brain, Copy, Check, CornerDownRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useUiStore } from '../../lib/store'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  streaming: boolean
}

/**
 * AI 对话气泡 — 流式增量 Markdown + 闪烁光标 + think 折叠。
 *
 * 设计:
 * 1. 流式(streaming=true):逐字推进 shown,渲染走 Markdown(增量)
 *    — 流式与结束同为 Markdown,无"纯文本→Markdown"重排跳动
 *    — 末尾 accent 光标闪烁(prose-ai-streaming)
 * 2. <think> 段:折叠 chip(流式逐字 / 结束 Markdown),accent 着色区分"推理"
 *    — think 与正文各自独立渲染,互不抢占
 */
// 18ms/字符 — 贴近 main 端 12字/25ms 流速度,避免大幅积压;略慢于流保留逐字淡入感
const CHAR_DELAY_MS = 18

type Segment = { kind: 'text' | 'think'; content: string }

/**
 * 把文本拆成 text / think 段
 * - text 段:对外显示(角色回复)
 * - think 段:折叠区显示(AI 内部思考)
 *   - 闭合块:整段是一个 think
 *   - 未闭合块(只有开 <think> 没匹配到 </think>):把"开标签起的剩余"全归到 think 段
 */
/**
 * 把字面转义(反斜杠 n/t/r)还原成真换行/制表 —— 但只在代码围栏之外。
 * - 模型有时会把 \n 当文本输出(尤其中文模型),正文里就成了字面 "\n" 而非换行。
 * - 代码块(``` ... ```)内的 \n 必须保留(那是源码里的字符串字面量),不能动。
 * - 围栏用 ``` 开闭计数;流式未闭合的代码块也视为"在块内",保守不转义。
 */
const normalizeEscapes = (text: string): string => {
  if (!text.includes('\\n') && !text.includes('\\t') && !text.includes('\\r')) return text
  const parts = text.split(/(```)/g)
  let inCode = false
  return parts
    .map((part) => {
      if (part === '```') {
        inCode = !inCode
        return part
      }
      if (inCode) return part
      return part
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '')
    })
    .join('')
}

const splitThinkSegments = (raw: string): Segment[] => {
  const segs: Segment[] = []
  const re = /<think>([\s\S]*?)(<\/think>|$)/g
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    if (m.index > lastIndex) {
      segs.push({ kind: 'text', content: raw.slice(lastIndex, m.index) })
    }
    segs.push({ kind: 'think', content: m[1] ?? '' })
    lastIndex = m.index + m[0].length
    if (!m[2]) {
      // 未闭合的 <think> — 模型还在思考
      lastIndex = raw.length
      break
    }
  }
  if (lastIndex < raw.length) {
    segs.push({ kind: 'text', content: raw.slice(lastIndex) })
  }
  return segs
}

/**
 * Token 估算:LLM 内部按 token 算,中文字符 ≈ 1-2 token / 字,英文 word ≈ 1-1.3 token。
 * - 我们拿不到精确 usage(provider 不返回)— 粗略按 `char * 1.3` 估
 * - 中文字符比英文单词 token 率高,这里按 CJK 主导取 1.3
 * - 数字 / 标点也按 1 token 一段估
 *
 * 未来如果 main 端从 stream `end` 事件拿到 `usage.total_tokens`,直接替换这个函数即可
 */
const estimateTokens = (s: string): number => {
  if (!s) return 0
  // CJK 字符(中文/日文/韩文)每字约 1-2 token,取保守 1.5
  const cjk = (s.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length
  // 非 CJK 字符按 ~4 字符/token 估(英文平均 4 字符 1 token)
  const nonCjk = s.length - cjk
  return Math.max(1, Math.round(cjk * 1.5 + nonCjk / 4))
}

/**
 * 递归抽取 React 节点树里的纯文本(rehype-highlight 把代码拆成 hljs span)。
 * 用于"复制代码"——拿到的必须是去掉标记的源码,而非 [object Object]。
 */
const nodeToText = (node: unknown): string => {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeToText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return nodeToText((node as { props: { children?: unknown } }).props?.children)
  }
  return ''
}

/**
 * Markdown 渲染 — 流式期与结束期共用。
 * - pre(代码块)→ CodeBlock(语言标签 + 复制按钮 + 独立表面)
 * - a(链接)→ 新窗口打开(Electron 外链不内嵌)
 * 流式逐字推进的子串也走 Markdown,故结束时无"纯文本→Markdown"重排跳动。
 * streaming 时挂 prose-ai-streaming → 末尾闪烁光标(CSS ::after)。
 */
const MarkdownBody = ({
  content,
  streaming = false,
  muted = false
}: {
  content: string
  streaming?: boolean
  /** think 段用:弱化为副文字色 + 小一号,与正文答案区分(对齐 Claude 思考区) */
  muted?: boolean
}): JSX.Element => (
  <div className={cn('prose-ai', muted && 'prose-ai-think', streaming && 'prose-ai-streaming')}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        pre: ({ children }) => {
          const codeEl = (Array.isArray(children) ? children[0] : children) as
            | { props?: { className?: string; children?: unknown } }
            | undefined
          const className = codeEl?.props?.className ?? ''
          const match = /language-([\w]+)/.exec(className)
          const lang = match?.[1] ?? ''
          // rehype-highlight 把 code 子节点拆成 <span class="hljs-...">,
          // 不能再 String(children) — 递归抽纯文本用于复制。
          const raw = nodeToText(codeEl?.props?.children).replace(/\n$/, '')
          return <CodeBlock language={lang} value={raw}>{codeEl?.props?.children as React.ReactNode}</CodeBlock>
        },
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        )
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
)

/**
 * 流式逐字打字机 — 仅 streaming=true 时工作。
 * 逐字推进 shown,但渲染走 Markdown(增量),流式与结束同为 Markdown,
 * 消除"纯文本→Markdown"的结束重排跳动。
 */
const StreamingTypewriter = ({
  content,
  muted = false
}: {
  content: string
  muted?: boolean
}): JSX.Element => {
  const totalLen = content.length
  const totalLenRef = useRef(totalLen)
  useEffect(() => {
    totalLenRef.current = totalLen
  }, [totalLen])
  const [shown, setShown] = useState(0)
  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef<number>(performance.now())

  useEffect(() => {
    if (shown > totalLen) setShown(totalLen)
  }, [totalLen, shown])

  useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (shown >= totalLenRef.current) return
    lastTickRef.current = performance.now()
    const tick = (): void => {
      const target = totalLenRef.current
      if (target === 0) return
      const now = performance.now()
      if (now - lastTickRef.current >= CHAR_DELAY_MS) {
        lastTickRef.current = now
        setShown((prev) => Math.min(prev + 1, target))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  // 只依赖 [shown] — content 增长不重置 lastTickRef(否则字符永远不推进)
  }, [shown])

  const visible = content.slice(0, shown)
  if (!visible) return <></>
  return <MarkdownBody content={visible} streaming={true} muted={muted} />
}

/**
 * think 折叠 chip — 正文主位,think 收成一行 pill,不挤压正文纵向空间。
 * - 折叠态:仅 pill(Brain + 标签),零内容 DOM
 * - 流式且未闭合 → 自动展开,逐字淡入;闭合/流结束 → 自动折回
 * - 结束后展开 → Markdown 渲染思考内容
 * - 用户点击 pill 可手动 toggle
 *
 * 标签:`思考中…`(未闭合)/ `已思考 (N token)`(已结束)
 */
const ThinkChip = ({
  content,
  messageStreaming,
  isLastUnclosed,
  startIndex
}: {
  content: string
  messageStreaming: boolean
  isLastUnclosed: boolean
  startIndex: number
}): JSX.Element => {
  const fullTokens = estimateTokens(content)
  const autoOpen = isLastUnclosed
  const [open, setOpen] = useState(autoOpen)
  useEffect(() => {
    setOpen(autoOpen)
  }, [autoOpen])

  const label = isLastUnclosed ? '思考中…' : `已思考 (${fullTokens} token)`
  // 流式期:未闭合段随流逐字;已闭合段随整条消息的 streaming 走
  // 结束后:整段 Markdown 渲染
  const segStreaming = messageStreaming && isLastUnclosed

  return (
    <div className="my-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-accent-soft/60 border border-accent/20 text-[11px] text-accent hover:bg-accent-soft transition-colors"
        aria-expanded={open}
        data-testid={`think-chip-${startIndex}`}
      >
        <ChevronRight className={cn('w-3 h-3 transition-transform', open && 'rotate-90')} />
        <Brain className="w-3 h-3" />
        <span>{label}</span>
      </button>
      {open ? (
        <div className="mt-1.5 ml-1 pl-3 border-l border-border max-h-40 overflow-y-auto text-[12px] leading-relaxed">
          {segStreaming ? (
            <StreamingTypewriter content={content} muted={true} />
          ) : (
            <MarkdownBody content={content} muted={true} />
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * 正文段 — 流式逐字淡入,结束后 Markdown 渲染。
 */
const TextSegment = ({
  content,
  streaming
}: {
  content: string
  streaming: boolean
}): JSX.Element => {
  if (streaming) {
    return <StreamingTypewriter content={content} />
  }
  return <MarkdownBody content={content} />
}

/**
 * TypewriterText — assistant 气泡正文区。
 *
 * think 段与 text 段各自独立渲染,互不抢占。
 * - think:折叠 chip(流式逐字 / 结束 Markdown)
 * - text:流式逐字淡入 / 结束 Markdown
 */
export const TypewriterText = ({
  text,
  streaming
}: {
  text: string
  streaming: boolean
}): JSX.Element => {
  // 先把字面 \n 还原成真换行(代码块外),再分段 —— 避免正文里出现字面 "\n"
  const normalized = useMemo(() => normalizeEscapes(text), [text])
  const segments = useMemo(() => splitThinkSegments(normalized), [normalized])
  const lastSeg = segments[segments.length - 1]
  const lastIsOpenThink = streaming && lastSeg?.kind === 'think' && !normalized.endsWith('</think>')

  let offset = 0 // 跨段累计字符偏移,给每段唯一 startIndex(避免 key 碰撞)
  return (
    <div className="leading-relaxed">
      {segments.map((seg, segIdx) => {
        const segStart = offset
        offset += seg.content.length
        if (seg.kind === 'think') {
          const isLastSeg = segIdx === segments.length - 1
          return (
            <ThinkChip
              key={`think-${segIdx}`}
              content={seg.content}
              messageStreaming={streaming}
              isLastUnclosed={isLastSeg && lastIsOpenThink}
              startIndex={segStart}
            />
          )
        }
        return <div key={`text-${segIdx}`}><TextSegment content={seg.content} streaming={streaming} /></div>
      })}
    </div>
  )
}

/**
 * 剥离 <think> 段,只留对外可见的正文(用于"复制回复")。
 */
const stripThink = (raw: string): string =>
  raw.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim()

/**
 * 代码块 — 对齐 ChatGPT/Claude/Cursor:
 * - 顶栏:语言标签(左)+ 复制按钮(右,带"已复制"反馈)
 * - 独立表面(bg-bg 最深档,凹陷感),与行内 code(bg-bg-elevated 抬起)区分
 * - 语法高亮:rehype-highlight 已把 code 子节点拆成 hljs span,直接渲染着色;
 *   value(纯文本)仅用于"复制代码"。
 */
const CodeBlock = ({
  language,
  value,
  children
}: {
  language: string
  value: string
  children?: React.ReactNode
}): JSX.Element => {
  const [copied, setCopied] = useState(false)
  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard?.writeText(value)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = value
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* noop */
      }
      document.body.removeChild(ta)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  const long = value.split('\n').length > 16
  return (
    <div className="code-block my-2 rounded-md border border-border overflow-hidden">
      <div className="flex items-center justify-between h-7 px-2.5 bg-bg-elevated border-b border-border">
        <span className="text-[10px] font-mono uppercase tracking-wide text-text-muted select-none">
          {language || 'text'}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-text transition-colors"
          aria-label="复制代码"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <pre
        className={cn(
          'overflow-x-auto bg-bg p-2.5 text-[12px] leading-[1.6] text-text',
          long && 'max-h-72 overflow-y-auto'
        )}
      >
        <code className="font-mono whitespace-pre">{children}</code>
      </pre>
    </div>
  )
}

/**
 * 消息操作条 — hover 显形(对齐 ChatGPT)。当前仅"复制回复"。
 */
const MessageActions = ({ text }: { text: string }): JSX.Element => {
  const [copied, setCopied] = useState(false)
  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard?.writeText(stripThink(text))
    } catch {
      /* noop */
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  const [inserted, setInserted] = useState(false)
  const onInsert = (): void => {
    const cur = useUiStore.getState().scriptSource
    useUiStore.getState().editScriptSource(`${cur}\n\n${stripThink(text)}`)
    setInserted(true)
    window.setTimeout(() => setInserted(false), 1500)
  }
  return (
    <div className="mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-text-muted hover:text-text hover:bg-bg-elevated transition-colors"
        aria-label="复制回复"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        <span>{copied ? '已复制' : '复制'}</span>
      </button>
      <button
        type="button"
        onClick={onInsert}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-text-muted hover:text-accent hover:bg-accent-soft transition-colors"
        aria-label="插入到剧本"
      >
        {inserted ? <Check className="w-3 h-3" /> : <CornerDownRight className="w-3 h-3" />}
        <span>{inserted ? '已插入' : '插入到剧本'}</span>
      </button>
    </div>
  )
}

/**
 * "思考中"指示器 — 首个 token 到达前的等待态。
 * 三个 accent 圆点依次脉动(对齐 ChatGPT/Claude 的生成前动效),比孤立 spinner 更贴合对话语境。
 */
const ThinkingDots = (): JSX.Element => (
  <div className="inline-flex items-center gap-1 py-1.5" aria-label="AI 正在思考">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="w-1.5 h-1.5 rounded-full bg-accent animate-thinking-dot"
        style={{ animationDelay: `${i * 160}ms` }}
      />
    ))}
  </div>
)

export const AiMessageBubble = ({
  message,
  provider
}: {
  message: Message
  provider?: string
}): JSX.Element => {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-accent text-white px-3 py-2 rounded-2xl rounded-tr-md text-sm whitespace-pre-wrap break-words">
          {message.text}
        </div>
      </div>
    )
  }
  // assistant:全宽文档式(对齐 ChatGPT/Cursor),无气泡;头像 + 正文 + hover 操作
  const initial = (provider ?? 'AI').charAt(0).toUpperCase()
  return (
    <div className="group flex gap-2">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-soft to-accent/20 border border-accent/30 flex items-center justify-center shrink-0 shadow-sm">
        <span className="text-[10px] font-semibold text-accent">{initial}</span>
      </div>
      <div className="min-w-0 flex-1 pt-0.5 text-sm text-text">
        {message.streaming && !message.text ? (
          <ThinkingDots />
        ) : (
          <TypewriterText text={message.text} streaming={message.streaming} />
        )}
        {!message.streaming && message.text ? <MessageActions text={message.text} /> : null}
      </div>
    </div>
  )
}
