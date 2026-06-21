/**
 * chat-history — AI 面板消息历史 → provider 多轮 messages[]
 *
 * 纯函数,便于测试。错误消息 / 空文本不进上下文(避免把报错喂回模型)。
 */

export interface PanelMessage {
  role: 'user' | 'assistant'
  text: string
  errorText?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * 把历史消息打包成 messages[],并在末尾追加本轮新用户输入。
 * @param history setMessages 更新前的历史(不含本轮新消息)
 * @param newUserText 本轮用户输入
 */
export const toChatMessages = (history: readonly PanelMessage[], newUserText: string): ChatMessage[] => {
  const prior: ChatMessage[] = []
  for (const m of history) {
    if (m.errorText) continue
    if (!m.text || m.text.trim() === '') continue
    prior.push({ role: m.role, content: m.text })
  }
  prior.push({ role: 'user', content: newUserText })
  return prior
}
