import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VoicePanel } from './VoicePanel'
import { useUiStore } from '../../lib/store'

vi.mock('../../lib/ipc/use-voice', () => ({
  useVoice: () => ({
    list: vi.fn().mockResolvedValue({
      ok: true,
      items: [{ id: 'line1', text: '你好', audioPath: 'assets/voice/line1.mp3', characterId: 'koyuki' }]
    }),
    generate: vi.fn(),
    preview: vi.fn(),
    delete: vi.fn()
  })
}))

vi.mock('../../lib/ipc/use-preferences', () => ({
  usePreference: () => ({
    data: { defaultProvider: 'edge', defaultVoiceId: 'zh-female', batchConcurrency: 2, previewEnabled: false }
  })
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: () => ({ data: false })
  }
})

describe('VoicePanel', () => {
  beforeEach(() => {
    useUiStore.setState({ projectPath: '/proj' })
  })

  it('edge provider 时重新生成按钮可用', async () => {
    render(<VoicePanel />)
    const btn = await screen.findByTitle('重新生成')
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })
})
