/**
 * task-queue 单测 — 状态机正确性
 *
 * 重点(Phase 0 bug 复现):
 *   - provider 吐 error chunk 后再正常返回时,队列只应发 `error` 终态,
 *     绝不能紧接着再发一个 `done`(error→done 竞态会把错误 UI 覆盖成成功)。
 *
 * Mock 边界(testing-conventions):aiProxy = fake;sender = fake WebContents。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WebContents } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'
import type { AiChunk, AiRequest } from './types.js'

type GenerateFn = (req: AiRequest, onChunk: (c: AiChunk) => void) => Promise<void>

const generateMock = vi.fn<GenerateFn>()

vi.mock('./ai-proxy.js', () => ({
  aiProxy: {
    generate: (req: AiRequest, onChunk: (c: AiChunk) => void) => generateMock(req, onChunk)
  }
}))

type CapturedStatus = { taskId: string; status: string; error?: string }

const makeSender = (): WebContents & { statuses: CapturedStatus[]; deltas: string[] } => {
  const statuses: CapturedStatus[] = []
  const deltas: string[] = []
  const sender = {
    isDestroyed: () => false,
    send: (channel: string, payload: CapturedStatus | { taskId: string; delta: string }) => {
      if (channel === IPC.ai.status) statuses.push(payload as CapturedStatus)
      if (channel === IPC.ai.stream) deltas.push((payload as { delta: string }).delta)
    },
    statuses,
    deltas
  }
  return sender as unknown as WebContents & { statuses: CapturedStatus[]; deltas: string[] }
}

const baseReq: AiRequest = { prompt: 'hi', context: 'ctx', provider: 'openai' }

const waitForTerminal = async (
  sender: { statuses: CapturedStatus[] },
  ms = 1000
): Promise<void> => {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (sender.statuses.some((s) => s.status === 'done' || s.status === 'error')) {
      // 再等一拍,捕获 error 之后可能错误追加的 done
      await new Promise((r) => setTimeout(r, 20))
      return
    }
    await new Promise((r) => setTimeout(r, 5))
  }
}

describe('aiTaskQueue — error→done 竞态', () => {
  beforeEach(() => {
    generateMock.mockReset()
  })

  it('provider 吐 error chunk 后正常返回 → 只发 error,不再发 done', async () => {
    const { aiTaskQueue } = await import('./task-queue.js')
    generateMock.mockImplementation(async (_req, onChunk) => {
      onChunk({ type: 'start' })
      onChunk({ type: 'error', error: { code: 'PROVIDER_ERROR', message: 'boom' } })
      // provider 实现里 error 后通常 return(不再 throw)
    })
    const sender = makeSender()
    aiTaskQueue.enqueue(baseReq, sender)
    await waitForTerminal(sender)

    const terminal = sender.statuses.filter((s) => s.status === 'done' || s.status === 'error')
    expect(terminal).toHaveLength(1)
    expect(terminal[0]?.status).toBe('error')
    expect(sender.statuses.some((s) => s.status === 'done')).toBe(false)
  })

  it('正常流(无 error)→ 发 done', async () => {
    const { aiTaskQueue } = await import('./task-queue.js')
    generateMock.mockImplementation(async (_req, onChunk) => {
      onChunk({ type: 'start' })
      onChunk({ type: 'delta', text: 'hello' })
      onChunk({ type: 'end' })
    })
    const sender = makeSender()
    aiTaskQueue.enqueue(baseReq, sender)
    await waitForTerminal(sender)

    const terminal = sender.statuses.filter((s) => s.status === 'done' || s.status === 'error')
    expect(terminal).toHaveLength(1)
    expect(terminal[0]?.status).toBe('done')
  })
})

describe('aiTaskQueue — 超时与取消的区分', () => {
  beforeEach(() => {
    generateMock.mockReset()
  })

  it('挂死连接 → 120s 超时 abort,终态 error 且 error 文本为 timeout(非 cancelled)', async () => {
    vi.useFakeTimers()
    try {
      const { aiTaskQueue } = await import('./task-queue.js')
      // 模拟挂死:请求永不返回,abort 时以 AbortError 拒绝
      generateMock.mockImplementation(
        (req) =>
          new Promise<void>((_, reject) => {
            req.signal?.addEventListener('abort', () => {
              const e = new Error('aborted')
              e.name = 'AbortError'
              reject(e)
            })
          })
      )
      const sender = makeSender()
      aiTaskQueue.enqueue(baseReq, sender)
      await vi.advanceTimersByTimeAsync(120_500)
      // 排空微任务队列
      await vi.advanceTimersByTimeAsync(0)

      const terminal = sender.statuses.filter((s) => s.status === 'error' || s.status === 'done')
      expect(terminal).toHaveLength(1)
      expect(terminal[0]?.status).toBe('error')
      expect(terminal[0]?.error).toBe('timeout')
    } finally {
      vi.useRealTimers()
    }
  })

  it('用户主动取消 → 终态 error 且 error 文本为 cancelled', async () => {
    const { aiTaskQueue } = await import('./task-queue.js')
    let release: ((v: void) => void) | undefined
    generateMock.mockImplementation(
      (req) =>
        new Promise<void>((resolve, reject) => {
          release = resolve
          req.signal?.addEventListener('abort', () => {
            const e = new Error('aborted')
            e.name = 'AbortError'
            reject(e)
          })
        })
    )
    const sender = makeSender()
    aiTaskQueue.enqueue(baseReq, sender)
    await new Promise((r) => setTimeout(r, 10))
    aiTaskQueue.cancel(sender.statuses[0]!.taskId)
    release?.()
    await new Promise((r) => setTimeout(r, 30))

    const terminal = sender.statuses.filter((s) => s.status === 'error' || s.status === 'done')
    expect(terminal).toHaveLength(1)
    expect(terminal[0]?.status).toBe('error')
    expect(terminal[0]?.error).toBe('cancelled')
  })
})
