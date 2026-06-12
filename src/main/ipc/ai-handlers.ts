import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { IPC } from '../../shared/ipc-channels.js'
import { aiProxy } from '../ai/ai-proxy.js'
import { aiTaskQueue } from '../ai/task-queue.js'
import { keyManager } from '../preferences/key-manager.js'
import type { AiProvider, AiProviderInfo } from '../ai/types.js'

const isAiProvider = (s: string): s is AiProvider => s === 'openai' || s === 'claude' || s === 'ollama'

type AiGenerateRequest = {
  prompt: string
  context: string
  provider: AiProvider
  model?: string
  baseUrl?: string
}

type AiListTasksResult = {
  tasks: Array<{
    taskId: string
    status: 'pending' | 'running' | 'done' | 'error'
    prompt: string
    provider: AiProvider
    error?: string
    createdAt: number
  }>
}

/**
 * 合并 hasKey 信息,UI 才能区分"已配置 / 未配置"
 * (P0-1 修复: 之前 listProviders 只返回静态 info,UI 强转 hasKey 为 undefined)
 */
const listProvidersWithKey = (): Array<AiProviderInfo & { hasKey: boolean }> =>
  aiProxy.listProviders().map((p) => ({ ...p, hasKey: keyManager.has(p.id) }))

export const registerAiHandlers = (): void => {
  ipcMain.handle(IPC.ai.listProviders, async () => {
    return listProvidersWithKey()
  })

  ipcMain.handle(IPC.ai.getConfig, async () => {
    return aiProxy.getConfig()
  })

  ipcMain.handle(
    IPC.ai.setConfig,
    async (_e: IpcMainInvokeEvent, config: { provider: string; baseUrl?: string; model?: string }) => {
      if (!isAiProvider(config.provider)) {
        return { ok: false, error: `unknown provider: ${config.provider}` }
      }
      aiProxy.setConfig({ provider: config.provider, baseUrl: config.baseUrl, model: config.model })
      return { ok: true }
    }
  )

  /**
   * 入队 AI 生成任务,立即返回 taskId。
   * 流式 delta 通过 ai:stream 推送,状态变化通过 ai:status 推送。
   */
  ipcMain.handle(
    IPC.ai.generate,
    async (e, req: AiGenerateRequest): Promise<{ taskId: string; status: 'pending' }> => {
      // baseUrl fallback: 若 renderer 没传,从 aiConfig 读,
      // 让 AI 面板发消息也能命中 minimaxi 这类 OpenAI 兼容服务
      const effectiveBaseUrl = req.baseUrl ?? aiProxy.getConfig().baseUrl
      const finalReq = { ...req, baseUrl: effectiveBaseUrl }
      const taskId = aiTaskQueue.enqueue(finalReq, e.sender)
      return { taskId, status: 'pending' }
    }
  )

  ipcMain.handle(IPC.ai.cancel, async (_e, taskId: string) => {
    return aiTaskQueue.cancel(taskId)
  })

  ipcMain.handle(IPC.ai.listTasks, async (): Promise<AiListTasksResult> => {
    const tasks = aiTaskQueue.list().map((t) => ({
      taskId: t.taskId,
      status: t.status,
      prompt: t.prompt,
      provider: t.provider,
      error: t.error,
      createdAt: t.createdAt
    }))
    return { tasks }
  })

  // ---- P0-1 修复: 缺失的四个 AI Key IPC handler ----
  ipcMain.handle(
    IPC.ai.keySet,
    async (_e: IpcMainInvokeEvent, provider: string, key: string): Promise<{ ok: boolean; error?: string }> => {
      if (!isAiProvider(provider)) {
        return { ok: false, error: `unknown provider: ${provider}` }
      }
      if (!key || key.trim().length === 0) {
        return { ok: false, error: 'API Key 不能为空' }
      }
      try {
        keyManager.set(provider, key)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.ai.keyDelete,
    async (_e: IpcMainInvokeEvent, provider: string): Promise<{ ok: boolean; error?: string }> => {
      if (!isAiProvider(provider)) {
        return { ok: false, error: `unknown provider: ${provider}` }
      }
      try {
        keyManager.delete(provider)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(IPC.ai.keyHas, async (_e: IpcMainInvokeEvent, provider: string): Promise<boolean> => {
    if (!isAiProvider(provider)) return false
    return keyManager.has(provider)
  })

  /**
   * 测试连接 — 流式版本(P1-项目相关 + 流式展示)
   *
   * 协议:
   * 1. 立刻返回 { taskId, status: 'pending' }
   * 2. 流式 delta 通过 ai:stream 推送 → renderer 端订阅
   * 3. 终态通过 ai:status 推送(status: done / error)
   * 4. 15s 超时兜底(防止 provider 挂起)
   *
   * 这样做的好处:
   * - 不阻塞偏好页(不再转圈圈)
   * - 用户能看到"正在请求..."→ 第一个 token 抵达 → 持续打字
   * - prompt 来自项目(主角/场景),与"实际工作流"对齐
   */
  ipcMain.handle(
    IPC.ai.connectionTest,
    async (
      e: IpcMainInvokeEvent,
      req: { prompt?: string; context?: string; provider: string; model?: string; baseUrl?: string }
    ): Promise<{ taskId: string; status: 'pending' } | { ok: false; error: string }> => {
      if (!isAiProvider(req.provider)) {
        return { ok: false, error: `unknown provider: ${req.provider}` }
      }
      if (!keyManager.has(req.provider)) {
        return { ok: false, error: '尚未配置 API Key' }
      }
      const prompt = req.prompt ?? '写一句与本项目设定相符的招呼,不超过 30 字。'
      const context = req.context ?? '你是 Galide 的 AI 助手,帮用户创作 galgame 剧本。'
      const baseUrl = req.baseUrl ?? aiProxy.getConfig().baseUrl
      const aiReq = { prompt, context, provider: req.provider, model: req.model, baseUrl }

      // 走 aiTaskQueue 的同一 channel(ai:stream / ai:status),但用独立 taskId
      // 避免与"AI 面板"的任务在 listTasks 里混淆
      const taskId = randomUUID()
      const sender = e.sender
      let finished = false
      const finish = (status: 'done' | 'error', error?: string): void => {
        if (finished) return
        finished = true
        if (!sender.isDestroyed()) {
          sender.send(IPC.ai.status, error ? { taskId, status, error } : { taskId, status })
        }
      }
      const timer = setTimeout(() => finish('error', '连接测试超时(15s)'), 15_000)

      // 同步:立刻开始发请求(不 await — invoke handler 立刻返回 taskId)
      void (async (): Promise<void> => {
        // connectionTest 自己的缓冲器(不走 aiTaskQueue)
        let buffer = ''
        let flushTimer: NodeJS.Timeout | null = null
        const flush = (): void => {
          if (buffer.length === 0) return
          if (flushTimer !== null) {
            clearTimeout(flushTimer)
            flushTimer = null
          }
          if (!sender.isDestroyed()) {
            sender.send(IPC.ai.stream, { taskId, delta: buffer })
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
            sender.send(IPC.ai.status, { taskId, status: 'pending' })
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
              flush() // 残余
              finish('error', `${chunk.error.code}: ${chunk.error.message}`)
            } else if (chunk.type === 'end') {
              clearTimeout(timer)
              flush() // 残余
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
  )
}
