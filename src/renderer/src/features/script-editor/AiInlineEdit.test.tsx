/**
 * AiInlineEdit — 使用已配置的 provider(Phase 0 bug 复现)
 *
 * 之前 generate 硬编码 provider:'openai',用户在偏好里选了 claude/ollama 也无效。
 * 修复后应读取 ai.getConfig() 的 provider。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AiInlineEdit } from './AiInlineEdit.js'

const generate = vi.fn(async (_req: { provider: string }) => ({
  taskId: 't1',
  status: 'pending' as const
}))
const getConfig = vi.fn(async () => ({ provider: 'claude' as const }))

beforeEach(() => {
  generate.mockClear()
  getConfig.mockClear()
  ;(window as unknown as { galide: unknown }).galide = {
    ai: {
      generate,
      getConfig,
      stream: () => () => undefined,
      onStatus: () => () => undefined
    }
  }
})

describe('AiInlineEdit — provider 取自配置', () => {
  it('点击动作时用 getConfig 返回的 provider(claude)而非硬编码 openai', async () => {
    render(<AiInlineEdit onClose={() => undefined} content="第一行\n第二行" />)
    // 等待 getConfig effect 落地
    await waitFor(() => expect(getConfig).toHaveBeenCalled())
    fireEvent.click(screen.getByText('续写'))
    await waitFor(() => expect(generate).toHaveBeenCalled())
    const arg = generate.mock.calls[0]?.[0]
    expect(arg?.provider).toBe('claude')
  })
})
