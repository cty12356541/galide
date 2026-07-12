/**
 * TestStreamText — streaming response display for connection test
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Brain } from 'lucide-react'

type Seg = { kind: 'text' | 'think'; content: string }

const splitThink = (raw: string): Seg[] => {
  const segs: Seg[] = []
  const re = /<think>([\s\S]*?)(<\/think>|$)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) segs.push({ kind: 'text', content: raw.slice(last, m.index) })
    segs.push({ kind: 'think', content: m[1] ?? '' })
    last = m.index + m[0].length
    if (!m[2]) {
      last = raw.length
      break
    }
  }
  if (last < raw.length) segs.push({ kind: 'text', content: raw.slice(last) })
  return segs
}

const estimateTokens = (s: string): number => {
  if (!s) return 0
  const cjk = (s.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length
  const nonCjk = s.length - cjk
  return Math.max(1, Math.round(cjk * 1.5 + nonCjk / 4))
}

const PREF_CHAR_DELAY_MS = 45

const renderPrefChars = (s: string, startIndex: number): JSX.Element => {
  const lines = s.split('\n')
  return (
    <>
      {lines.map((line, lineIdx) => (
        <span key={`pl-${startIndex}-${lineIdx}`}>
          {line.length === 0 ? (
            <span className="block h-3" aria-hidden="true" />
          ) : (
            <>
              {Array.from(line).map((ch, chIdx) => {
                const globalIdx = startIndex + lineIdx * 50 + chIdx
                return (
                  <span
                    key={`pc-${globalIdx}-${ch}`}
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
      ))}
    </>
  )
}

export const TestStreamText = ({
  text,
  streaming
}: {
  text: string
  streaming: boolean
}): JSX.Element => {
  const segs = useMemo(() => splitThink(text), [text])
  const totalLen = useMemo(
    () => segs.reduce((acc, s) => acc + s.content.length, 0),
    [segs]
  )
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
    if (!streaming && shown < totalLenRef.current) {
      setShown(totalLenRef.current)
      return
    }
    if (shown >= totalLenRef.current) return
    lastTickRef.current = performance.now()
    const tick = (): void => {
      const target = totalLenRef.current
      if (target === 0) return
      const now = performance.now()
      if (now - lastTickRef.current >= PREF_CHAR_DELAY_MS) {
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
  }, [streaming, shown])

  let remaining = shown
  let charOffset = 0
  const lastSeg = segs[segs.length - 1]
  const lastIsOpenThink =
    streaming && lastSeg?.kind === 'think' && !text.endsWith('</think>>')

  return (
    <div className="text-sm leading-relaxed text-text min-h-[2rem]">
      {segs.map((s, i) => {
        if (s.kind === 'think') {
          const take = Math.min(s.content.length, remaining)
          remaining -= take
          const isLastUnclosed = i === segs.length - 1 && lastIsOpenThink
          const visibleContent = take > 0 ? s.content.slice(0, take) : ''
          const isLastSeg = i === segs.length - 1
          const lastSegIsText = lastSeg?.kind === 'text'
          const isThinkCompleted =
            lastSegIsText ||
            (isLastSeg && !lastIsOpenThink) ||
            (!streaming && take >= s.content.length)
          const label = ((): string => {
            const fullTokens = estimateTokens(s.content)
            const visibleTokens = estimateTokens(visibleContent)
            if (isLastUnclosed) return '思考中…'
            if (!isThinkCompleted) return `思考中… (${visibleTokens} / ${fullTokens} token)`
            return `已思考 (${fullTokens} token)`
          })()
          const block = (
            <div className="mt-1.5 ml-4 pl-3 border-l border-border whitespace-pre-wrap leading-relaxed font-mono text-[11px]">
              {take > 0 ? renderPrefChars(visibleContent, charOffset) : null}
            </div>
          )
          charOffset += take
          return (
            <details
              key={`t-${i}`}
              className="my-1.5 text-xs text-text-muted"
              open={isLastUnclosed}
            >
              <summary className="flex items-center gap-1.5 cursor-pointer select-none hover:text-text transition-colors list-none">
                <ChevronRight className="w-3 h-3 transition-transform [[details[open]_&]_&]:rotate-90" />
                <Brain className="w-3 h-3" />
                <span>{label}</span>
              </summary>
              {block}
            </details>
          )
        }
        const take = Math.min(s.content.length, remaining)
        remaining -= take
        if (take <= 0) return null
        const visible = s.content.slice(0, take)
        const rendered = renderPrefChars(visible, charOffset)
        charOffset += take
        return (
          <span key={`x-${i}`} className="whitespace-pre-wrap">
            {rendered}
          </span>
        )
      })}
    </div>
  )
}
