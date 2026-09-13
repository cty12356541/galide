/**
 * MarkdownRenderer — Markdown → JSX renderer (ReactMarkdown wrapper)
 */
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { cn } from '../../lib/utils'
import { CodeBlock, nodeToText } from './CodeBlock'

export const MarkdownBody = ({
  content,
  streaming = false,
  muted = false
}: {
  content: string
  streaming?: boolean
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
