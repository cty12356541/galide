/**
 * AiMessageBubbleWithStatus — message bubble wrapper with status/error display
 */
import { Clock, Sparkles } from 'lucide-react'
import { AiMessageBubble } from './AiMessageBubble'
import { AiErrorBanner } from '../../lib/ai-error-banner'

type Provider = 'openai' | 'claude'
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

export const AiMessageBubbleWithStatus = ({
  message,
  provider
}: {
  message: Message
  provider: Provider
}): JSX.Element => {
  if (message.role === 'user') {
    return <AiMessageBubble message={{ id: message.id, role: 'user', text: message.text, streaming: false }} provider={provider} />
  }
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
      <AiMessageBubble message={{ id: message.id, role: 'assistant', text: message.text, streaming: message.streaming }} provider={provider} />
      {statusHint && (
        <div className="flex items-center gap-1 pl-8 text-[10px] text-text-muted">
          {statusHint.icon}
          <span>{statusHint.text}</span>
        </div>
      )}
      {message.errorText ? (
        <div className="pl-8">
          <AiErrorBanner message={message.errorText} preferencesSection="ai" />
        </div>
      ) : null}
    </div>
  )
}
