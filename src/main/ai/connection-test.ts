/**
 * AI connection test — 独立 service
 *
 * P0-6 修复: 之前 connectionTest 内联在 ai-handlers.ts,共享 aiTaskQueue 的
 * ai:stream / ai:status 通道 → 与"AI 面板"任务混在 listTasks,UI 端难区分。
 *
 * 修法:
 * - 独立 IPC channel: ai:connTest:stream / ai:connTest:status
 * - taskId 用 crypto.randomUUID(),不进 aiTaskQueue
 * - 15s timeout 兜底
 * - 偏好页用 useConnectionTest hook 订阅
 */
import { randomUUID } from 'node:crypto'
import { aiProxy } from './ai-proxy.js'
import { keyManager } from '../preferences/key-manager.js'
import type { AiProvider } from './types.js'
import { IPC } from '../../shared/ipc-channels.js'
import type { IpcMainInvokeEvent } from 'electron'

export type ConnectionTestRequest = {
  prompt?: string
  context?: string
  provider: AiProvider
  model?: string
  baseUrl?: string
}

export type ConnectionTestResult =
  | { taskId: string; status: 'pending' }
  | { ok: false; error: string }

/**
 * 发起 connection test 流式调用。
 * - 立刻返回 taskId + pending
 * - 流式 delta 通过 IPC.ai.connTest.stream 推送
 * - 终态通过 IPC.ai.connTest.status 推送
 * - 15s timeout 兜底
 */
export const startConnectionTest = (
  e: IpcMainInvokeEvent,
  req: ConnectionTestRequest
): ConnectionTestResult => {
  if (!keyManager.has(req.provider)) {
    return { ok: false, error: '尚未配置 API Key' }
  }
  const prompt = req.prompt ?? '写一句与本项目设定相符的招呼,不超过 30 字。'
  const context = req.context ?? '你是 Galide 的 AI 助手,帮用户创作 galgame 剧本。'
  const baseUrl = req.baseUrl ?? aiProxy.getConfig().baseUrl
  const aiReq = { prompt, context, provider: req.provider, model: req.model, baseUrl }
  const taskId = randomUUID()
  const sender = e.sender
  let finished = false
  const finish = (status: 'done' | 'error', error?: string): void => {
    if (finished) return
    finished = true
    if (!sender.isDestroyed()) {
      sender.send(IPC.ai.connTest.status, error ? { taskId, status, error } : { taskId, status })
    }
  }
  const timer = setTimeout(() => finish('error', '连接测试超时(15s)'), 15_000)

  // 同步:立刻开始发请求
  void (async (): Promise<void> => {
    let buffer = ''
    let flushTimer: NodeJS.Timeout | null = null
    const flush = (): void => {
      if (buffer.length === 0) return
      if (flushTimer !== null) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      if (!sender.isDestroyed()) {
        sender.send(IPC.ai.connTest.stream, { taskId, delta: buffer })
      }
      buffer = ''
    }
    const schedule = (): void => {
      if (flushTimer !== null) return
      if (buffer.length >= 12) {
        flush()
        return
      }
      flushTimer = setTimeout(flush, 25)
    }

    try {
      if (!sender.isDestroyed()) {
        sender.send(IPC.ai.connTest.status, { taskId, status: 'pending' })
      }
      await aiProxy.generate(aiReq, (chunk) => {
        if (finished) return
        if (chunk.type === 'delta' && chunk.text) {
          buffer += chunk.text
          schedule()
          return
        }
        if (chunk.type === 'error' && chunk.error) {
          clearTimeout(timer)
          flush()
          finish('error', `${chunk.error.code}: ${chunk.error.message}`)
        } else if (chunk.type === 'end') {
          clearTimeout(timer)
          flush()
          finish('done')
        }
      })
    } catch (err) {
      clearTimeout(timer)
      flush()
      finish('error', err instanceof Error ? err.message : String(err))
    }
  })()

  return { taskId, status: 'pending' }
}
