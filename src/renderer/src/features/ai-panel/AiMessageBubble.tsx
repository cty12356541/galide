import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, Loader2, ChevronRight, Brain } from 'lucide-react'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  streaming: boolean
}

/**
 * 字符级别淡入渐出 + 平稳控速显示 + <think> 折叠思考块
 *
 * 关键设计:
 * 1. `text` 是 provider 已到达的字符
 * 2. 渲染只显示前 N 个字符(N 随时间增长,28ms/字符,略慢于 provider)
 * 3. 每个字符(text 段 + think 段)都用 CSS @keyframes 淡入(opacity 0→1, 220ms ease-out)
 *    — 展开折叠区时,已 show 字符保留字符淡入动画
 * 4. 流结束(不再 streaming)一次性 reveal 剩余字符
 * 5. <think>...</think> 块:
 *    - 默认折叠(用户主动展开看)
 *    - 流式阶段未闭合的 <think> 自动展开,让用户感知"AI 在想"
 *    - 字符级 typewriter 同样作用于 think 段(展开后看到字符渐进出现)
 *    - 标题:`<Brain/> 思考中…`(流式+未闭合) / `<Brain/> 已思考 (N 字)`(其余)
 */
// 字符淡出节奏:45ms/字符 — 比 provider 5-15ms 慢,让人眼有"从容展开"的视觉
// 太快(原 28ms)会感觉"闪一坨";太慢(>80ms)会感觉卡
// 配合 220ms 单字符淡入,整体节奏"自然聊天"感
const CHAR_DELAY_MS = 45

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
 * 把一段文本切成 typewriter 字符 span,保留 LLM 输出的分段结构
 * - `\n\n`(段落分隔)→ 渲染为段间距(段间留空)
 * - `\n`(行内换行)→ 渲染为 <br>(行内换行)
 * - 每个字符仍走字符级 typewriter(保留淡入)
 *
 * 不用 dangerouslySetInnerHTML:我们自己 split + JSX 渲染,安全
 */
const renderChars = (s: string, startIndex: number, withFade: boolean): JSX.Element => {
  // 把 \n\n 规整为 \n,再 split \n;空行(splits 后空串)被识别为段间距
  const lines = s.split('\n')
  return (
    <>
      {lines.map((line, lineIdx) => (
        <span key={`l-${startIndex}-${lineIdx}`}>
          {line.length === 0 ? (
            // 空行 → 段间距(<div height=1em>)
            <span className="block h-3" aria-hidden="true" />
          ) : (
            <>
              {Array.from(line).map((ch, chIdx) => {
                const globalIdx = startIndex + lineIdx * 50 + chIdx // 近似 index,够 animationDelay 错开
                return (
                  <span
                    key={`c-${globalIdx}-${ch}`}
                    className={withFade ? 'inline-block animate-char-fade-in' : 'inline-block'}
                    style={{ animationDelay: `${Math.min(chIdx * 8, 200)}ms` }}
                  >
                    {ch === ' ' ? '\u00A0' : ch}
                  </span>
                )
              })}
              {/* 行末:如果原文本下一行存在 + 非最后一行 → 换行(<br>);空行则由下一 line 提供间距 */}
              {lineIdx < lines.length - 1 && <br />}
            </>
          )}
        </span>
      ))}
    </>
  )
}

export const TypewriterText = ({
  text,
  streaming
}: {
  text: string
  streaming: boolean
}): JSX.Element => {
  const segments = useMemo(() => splitThinkSegments(text), [text])
  // 总字符数 = text 段 + think 段(typewriter 累计两者)
  // P0 修复: 用 ref 跟踪 totalLen,RAF effect 不依赖 totalLen
  // 避免 text 持续增长触发 effect 反复 cleanup 重置 lastTickRef(导致字符永远不推进)
  const totalLen = useMemo(
    () => segments.reduce((acc, s) => acc + s.content.length, 0),
    [segments]
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
      // 流结束:一次性 reveal 剩余(可能是展开后看到 think 段刚到)
      setShown(totalLenRef.current)
      return
    }
    if (shown >= totalLenRef.current) return
    lastTickRef.current = performance.now()
    const tick = (): void => {
      const target = totalLenRef.current
      if (target === 0) return
      const now = performance.now()
      if (now - lastTickRef.current >= CHAR_DELAY_MS) {
        lastTickRef.current = now
        setShown((prev) => {
          const next = Math.min(prev + 1, target)
          console.log(`[tick] pushed shown ${prev} -> ${next} (target=${target})`)
          return next
        })
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
  // 只依赖 [streaming, shown] — 不依赖 totalLen,
  // 避免 text 增长触发 cleanup 重置 lastTickRef 导致字符永远不推进
  }, [streaming, shown])

  // 切片:把 shown 字符按段切,保留 typewriter 推进
  let remaining = shown
  let charOffset = 0 // 跨段连续字符 index,用于 animationDelay 不重叠
  const lastSeg = segments[segments.length - 1]
  const lastIsOpenThink =
    streaming && lastSeg?.kind === 'think' && !text.endsWith('</think>>')

  return (
    <div className="leading-relaxed">
      {segments.map((seg, segIdx) => {
        if (seg.kind === 'think') {
          const take = Math.min(seg.content.length, remaining)
          remaining -= take
          const isLastUnclosed =
            segIdx === segments.length - 1 && lastIsOpenThink
          const visibleContent = take > 0 ? seg.content.slice(0, take) : ''
          // 标题状态机(关键修复 — 不再猜上限):
          //  - 思考进行中(lastSeg 是 think 且未闭合):"思考中…",不显示数字
          //  - 思考已结束(整流结束 OR lastSeg 是 text / text 在 think 之后):
          //    "已思考 (N token)",此时 N 已知
          //  - 部分 show 但已闭合(网络慢 / 中止):"思考中… (X / N)"
          //    这种情况罕见,但用户能看到进度
          const fullTokens = estimateTokens(seg.content)
          const visibleTokens = estimateTokens(visibleContent)
          const isLastSeg = segIdx === segments.length - 1
          const lastSegIsText = lastSeg?.kind === 'text'
          // 思考"已结束"条件:
          //  - lastSeg 是 text(已有正文在流,思考已经闭合了)
          //  - 或者 lastSeg 是 think 但已闭合(`text.endsWith('</think>>')`)且不再 streaming
          //  - 或者 show 完 + 整流结束
          const isThinkCompleted =
            lastSegIsText ||
            (isLastSeg && !lastIsOpenThink) ||
            (!streaming && take >= seg.content.length)
          const label = ((): string => {
            if (isLastUnclosed) {
              // 思考进行中 — 不知道上限,不显示数字
              return '思考中…'
            }
            if (!isThinkCompleted) {
              // 闭合了但还没轮完(网络慢)
              return `思考中… (${visibleTokens} / ${fullTokens} token)`
            }
            // 思考结束 — 此时 N 已知
            return `已思考 (${fullTokens} token)`
          })()
          const block = (
            <div className="mt-1.5 ml-4 pl-3 border-l border-border whitespace-pre-wrap leading-relaxed font-mono text-[11px]">
              {take > 0 ? renderChars(visibleContent, charOffset, true) : null}
            </div>
          )
          charOffset += take
          return (
            <details
              key={`think-${segIdx}`}
              className="my-2 text-xs text-text-muted"
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
        // text 段
        const take = Math.min(seg.content.length, remaining)
        remaining -= take
        if (take <= 0) return null
        const visible = seg.content.slice(0, take)
        const rendered = renderChars(visible, charOffset, true)
        charOffset += take
        return (
          <div key={`text-${segIdx}`} className="whitespace-pre-wrap">
            {rendered}
          </div>
        )
      })}
    </div>
  )
}

export const AiMessageBubble = ({ message }: { message: Message }): JSX.Element => {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-accent text-white px-3 py-2 rounded-2xl rounded-tr-md text-sm">
          {message.text}
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-2">
      <div className="w-6 h-6 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
        <Sparkles className="w-3 h-3 text-accent" />
      </div>
      <div className="max-w-[85%] bg-bg-elevated px-3 py-2 rounded-2xl rounded-tl-md text-sm text-text">
        {message.streaming && !message.text ? (
          <Loader2 className="w-3 h-3 animate-spin text-text-muted" />
        ) : (
          <TypewriterText text={message.text} streaming={message.streaming} />
        )}
      </div>
    </div>
  )
}
