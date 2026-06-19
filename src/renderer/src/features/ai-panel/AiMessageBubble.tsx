import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, ChevronRight, Brain } from 'lucide-react'
import { cn } from '../../lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  streaming: boolean
}

/**
 * AI 对话气泡 — 流式逐字 + 结束后 Markdown 渲染
 *
 * 设计:
 * 1. 流式(streaming=true):逐字符淡入(45ms/字符),渲染原始文本
 *    — 流由 main 端 12字/25ms 缓冲推进,逐字展开给"AI 在写"的渐进感
 * 2. 结束(streaming=false):react-markdown 渲染完整 Markdown
 *    — **加粗** / 列表 / 代码块 / 段落结构得以正确呈现
 *    — 修复原"逐字打字机跟不上流,done 时一次性蹦出积压字符"
 * 3. <think> 段:流式时折叠 chip 内逐字;结束时 Markdown 渲染,仍折叠
 *    — think 与正文各自独立 reveal/渲染,互不抢占
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
 * 把一段文本切成 typewriter 字符 span(仅流式期使用)
 * - `\n` → <br>;空行 → 段间距(block h-3)
 * - 每个字符走字符级 typewriter(保留淡入)
 *
 * startIndex 跨段唯一 → 避免 React key 碰撞(原版 lineIdx*50 近似,长行撞)。
 * 不用 dangerouslySetInnerHTML:自己 split + JSX 渲染,安全
 */
const renderChars = (s: string, startIndex: number): JSX.Element => {
  const lines = s.split('\n')
  let running = 0 // 跨行累计字符偏移(含被 split 掉的 \n),保证 globalIdx 跨行唯一
  return (
    <>
      {lines.map((line, lineIdx) => {
        const lineStart = running
        running += line.length + 1
        return (
          <span key={`l-${startIndex}-${lineIdx}`}>
            {line.length === 0 ? (
              <span className="block h-3" aria-hidden="true" />
            ) : (
              <>
                {Array.from(line).map((ch, chIdx) => {
                  const globalIdx = startIndex + lineStart + chIdx
                  return (
                    <span
                      key={`c-${globalIdx}-${ch}`}
                      className="inline-block animate-char-fade-in"
                      style={{ animationDelay: `${Math.min(chIdx * 8, 200)}ms` }}
                    >
                      {ch === ' ' ? '\u00A0' : ch}
                    </span>
                  )
                })}
                {lineIdx < lines.length - 1 && <br />}
              </>
            )}
          </span>
        )
      })}
    </>
  )
}

/**
 * 流式逐字打字机 — 仅 streaming=true 时工作。
 * streaming=false 时不再一次性蹦出全部(结束交给 Markdown 渲染),
 * 返回当前已 shown 的原始文本片段。
 */
const StreamingTypewriter = ({
  content,
  startIndex = 0
}: {
  content: string
  startIndex?: number
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
  return <>{renderChars(visible, startIndex)}</>
}

/**
 * Markdown 渲染 — 流式结束后用。
 * 套用 token 化的 prose 样式,继承气泡文字色(text-text)。
 */
const MarkdownBody = ({ content }: { content: string }): JSX.Element => (
  <div className="prose-ai">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
  </div>
)

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
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-bg border border-border text-[11px] text-text-muted hover:text-text hover:bg-bg-elevated transition-colors"
        aria-expanded={open}
        data-testid={`think-chip-${startIndex}`}
      >
        <ChevronRight className={cn('w-3 h-3 transition-transform', open && 'rotate-90')} />
        <Brain className="w-3 h-3" />
        <span>{label}</span>
      </button>
      {open ? (
        <div className="mt-1.5 ml-1 pl-3 border-l border-border max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed font-mono text-[11px] text-text-muted">
          {segStreaming ? (
            <StreamingTypewriter content={content} startIndex={startIndex} />
          ) : (
            <MarkdownBody content={content} />
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
  streaming,
  startIndex
}: {
  content: string
  streaming: boolean
  startIndex: number
}): JSX.Element => {
  if (streaming) {
    return <StreamingTypewriter content={content} startIndex={startIndex} />
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
  const segments = useMemo(() => splitThinkSegments(text), [text])
  const lastSeg = segments[segments.length - 1]
  const lastIsOpenThink = streaming && lastSeg?.kind === 'think' && !text.endsWith('</think>')

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
        return <div key={`text-${segIdx}`}><TextSegment content={seg.content} streaming={streaming} startIndex={segStart} /></div>
      })}
    </div>
  )
}

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
        <div className="max-w-[85%] bg-accent text-white px-3 py-2 rounded-2xl rounded-tr-md text-sm">
          {message.text}
        </div>
      </div>
    )
  }
  // 从 message 拿 provider(没存就 fallback accent)
  const initial = (provider ?? 'AI').charAt(0).toUpperCase()
  return (
    <div className="flex gap-2">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-soft to-accent/20 border border-accent/30 flex items-center justify-center shrink-0 shadow-sm">
        <span className="text-[10px] font-semibold text-accent">{initial}</span>
      </div>
      <div className="max-w-[85%] bg-bg-elevated border border-border/60 px-3.5 py-2.5 rounded-2xl rounded-tl-md text-sm text-text shadow-sm">
        {message.streaming && !message.text ? (
          <Loader2 className="w-3 h-3 animate-spin text-text-muted" />
        ) : (
          <TypewriterText text={message.text} streaming={message.streaming} />
        )}
      </div>
    </div>
  )
}
