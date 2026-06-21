/**
 * use-ai-config-form — 测试连接流订阅(Phase 0 bug 复现)
 *
 * 连接测试在 main 端走独立通道 ai:connTest:stream / ai:connTest:status
 * (见 connection-test.ts);renderer 必须订阅对应的 connTestStream/connTestStatus
 * 绑定,而不是共享的 ai:stream / ai:status —— 否则测试连接永远收不到流,只能等超时。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAiConfigForm } from './use-ai-config-form.js'

type StreamCb = (chunk: { taskId: string; delta: string }) => void
type StatusCb = (evt: { taskId: string; status: string; error?: string }) => void

const connTestStream = vi.fn<(cb: StreamCb) => () => void>()
const connTestStatus = vi.fn<(cb: StatusCb) => () => void>()
const sharedStream = vi.fn<(cb: StreamCb) => () => void>()
const sharedStatus = vi.fn<(cb: StatusCb) => () => void>()
let streamCb: StreamCb | null = null
let statusCb: StatusCb | null = null

beforeEach(() => {
  connTestStream.mockReset()
  connTestStatus.mockReset()
  sharedStream.mockReset()
  sharedStatus.mockReset()
  streamCb = null
  statusCb = null
  connTestStream.mockImplementation((cb) => {
    streamCb = cb
    return () => undefined
  })
  connTestStatus.mockImplementation((cb) => {
    statusCb = cb
    return () => undefined
  })
  sharedStream.mockImplementation(() => () => undefined)
  sharedStatus.mockImplementation(() => () => undefined)
  ;(window as unknown as { galide: unknown }).galide = {
    ai: {
      connectionTest: vi.fn(async () => ({ taskId: 't1', status: 'pending' as const })),
      cancel: vi.fn(async () => ({ ok: true, cancelled: true })),
      stream: sharedStream,
      onStatus: sharedStatus,
      connTestStream,
      connTestStatus
    }
  }
})

describe('useAiConfigForm.testConnection — 订阅独立 connTest 通道', () => {
  it('订阅 connTestStream/connTestStatus 而非共享通道', async () => {
    const { result } = renderHook(() => useAiConfigForm())
    let promise: Promise<unknown> | undefined
    await act(async () => {
      promise = result.current.testConnection({ provider: 'openai', prompt: 'hi' })
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(connTestStream).toHaveBeenCalled()
    expect(connTestStatus).toHaveBeenCalled()

    // 驱动流到完成,避免悬挂
    await act(async () => {
      streamCb?.({ taskId: 't1', delta: '你好' })
      statusCb?.({ taskId: 't1', status: 'done' })
      await promise
    })
    expect(result.current.testState.phase).toBe('done')
    expect(result.current.testState.text).toContain('你好')
  })
})
