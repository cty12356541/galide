import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Brain, Copy, Check, CornerDownRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useUiStore } from '../../lib/store'
import { MarkdownBody } from './MarkdownRenderer'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  streaming: boolean
}

/**
 * AI 对话气泡 — 流式增量 Markdown + 闪烁光标 + think 折叠。
 */
const CHAR_DELAY_MS = 18

type Segment = { kind: 'text' | 'think'; content: string }

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
      lastIndex = raw.length
      break
    }
  }
  if (lastIndex < raw.length) {
    segs.push({ kind: 'text', content: raw.slice(lastIndex) })
  }
  return segs
}

const estimateTokens = (s: string): number => {
  if (!s) return 0
  const cjk = (s.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length
  const nonCjk = s.length - cjk
  return Math.max(1, Math.round(cjk * 1.5 + nonCjk / 4))
}

// ── StreamingTypewriter ──

const StreamingTypewriter = ({
  content,
  muted = false,
  streaming = false
}: {
  content: string
  muted?: boolean
  streaming?: boolean
}): JSX.Element => {
  const totalLen = content.length
  const totalLenRef = useRef(totalLen)
  useEffect(() => {
    totalLenRef.current = totalLen
  }, [totalLen])
  const [shown, setShown] = useState(0)
  const [markdownText, setMarkdownText] = useState('')
  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef<number>(performance.now())
  const markdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  }, [shown])

  useEffect(() => {
    if (markdownTimerRef.current !== null) {
      clearTimeout(markdownTimerRef.current)
      markdownTimerRef.current = null
    }
    if (!streaming) {
      setMarkdownText(content)
      return
    }
    markdownTimerRef.current = setTimeout(() => {
      setMarkdownText(content.slice(0, shown))
    }, 100)
    return () => {
      if (markdownTimerRef.current !== null) {
        clearTimeout(markdownTimerRef.current)
        markdownTimerRef.current = null
      }
    }
  }, [content, shown, streaming])

  const visible = content.slice(0, shown)
  if (!visible) return <></>
  const rawSuffix = visible.slice(markdownText.length)
  return (
    <>
      {markdownText ? <MarkdownBody content={markdownText} streaming={false} muted={muted} /> : null}
      {rawSuffix ? (
        <span className="text-text whitespace-pre-wrap">
          {rawSuffix}
          <span className="ai-cursor" aria-hidden="true" />
        </span>
      ) : streaming ? (
        <span className="ai-cursor" aria-hidden="true" />
      ) : null}
    </>
  )
}

// ── ThinkChip ──

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
            <StreamingTypewriter content={content} muted={true} streaming={true} />
          ) : (
            <MarkdownBody content={content} muted={true} />
          )}
        </div>
      ) : null}
    </div>
  )
}

// ── TextSegment ──

const TextSegment = ({
  content,
  streaming
}: {
  content: string
  streaming: boolean
}): JSX.Element => {
  if (streaming) {
    return <StreamingTypewriter content={content} streaming={true} />
  }
  return <MarkdownBody content={content} />
}

// ── TypewriterText ──

export const TypewriterText = ({
  text,
  streaming
}: {
  text: string
  streaming: boolean
}): JSX.Element => {
  const normalized = useMemo(() => normalizeEscapes(text), [text])
  const segments = useMemo(() => splitThinkSegments(normalized), [normalized])
  const lastSeg = segments[segments.length - 1]
  const lastIsOpenThink = streaming && lastSeg?.kind === 'think' && !normalized.endsWith('</think>')

  let offset = 0
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

const stripThink = (raw: string): string =>
  raw.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim()

// ── MessageActions ──

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
      <button type="button" onClick={onCopy} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-text-muted hover:text-text hover:bg-bg-elevated transition-colors" aria-label="复制回复">
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        <span>{copied ? '已复制' : '复制'}</span>
      </button>
      <button type="button" onClick={onInsert} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-text-muted hover:text-accent hover:bg-accent-soft transition-colors" aria-label="插入到剧本">
        {inserted ? <Check className="w-3 h-3" /> : <CornerDownRight className="w-3 h-3" />}
        <span>{inserted ? '已插入' : '插入到剧本'}</span>
      </button>
    </div>
  )
}

// ── ThinkingDots ──

const ThinkingDots = (): JSX.Element => (
  <div className="inline-flex items-center gap-1 py-1.5" aria-label="AI 正在思考">
    {[0, 1, 2].map((i) => (
      <span key={i} className="w-1.5 h-1.5 rounded-full bg-accent animate-thinking-dot" style={{ animationDelay: `${i * 160}ms` }} />
    ))}
  </div>
)

// ── AiMessageBubble ──

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
