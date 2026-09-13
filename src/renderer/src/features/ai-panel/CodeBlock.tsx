/**
 * CodeBlock — syntax-highlighted code block with copy button
 */
import React, { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * 递归抽取 React 节点树里的纯文本(rehype-highlight 把代码拆成 hljs span)
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

export const CodeBlock = ({
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

export { nodeToText }
