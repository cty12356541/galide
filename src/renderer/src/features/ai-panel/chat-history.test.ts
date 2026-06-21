/**
 * chat-history — 把 AI 面板消息历史转成 provider 多轮 messages[]
 *
 * Phase 0:AiPanel 之前每次只发单条 prompt(无上下文记忆)。
 * 改为把历史(user/assistant)+ 新输入打包成 messages[],provider 才有多轮记忆。
 */
import { describe, it, expect } from 'vitest'
import { toChatMessages, type PanelMessage } from './chat-history.js'

const mk = (role: 'user' | 'assistant', text: string): PanelMessage => ({
  role,
  text,
  errorText: undefined
})

describe('toChatMessages', () => {
  it('空历史 → 只含新用户消息', () => {
    expect(toChatMessages([], '你好')).toEqual([{ role: 'user', content: '你好' }])
  })

  it('历史 user/assistant 进入 messages,末尾追加新输入', () => {
    const history: PanelMessage[] = [mk('user', '写个开场'), mk('assistant', '好的,这是开场...')]
    const msgs = toChatMessages(history, '继续')
    expect(msgs).toEqual([
      { role: 'user', content: '写个开场' },
      { role: 'assistant', content: '好的,这是开场...' },
      { role: 'user', content: '继续' }
    ])
  })

  it('跳过空文本与错误消息(不进上下文)', () => {
    const history: PanelMessage[] = [
      mk('user', '问题'),
      { role: 'assistant', text: '', errorText: 'PROVIDER_ERROR: boom' },
      mk('assistant', '正常回答')
    ]
    const msgs = toChatMessages(history, '下一个')
    expect(msgs).toEqual([
      { role: 'user', content: '问题' },
      { role: 'assistant', content: '正常回答' },
      { role: 'user', content: '下一个' }
    ])
  })
})
