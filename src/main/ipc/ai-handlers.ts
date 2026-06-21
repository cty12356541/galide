import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'
import { aiProxy } from '../ai/ai-proxy.js'
import { aiTaskQueue } from '../ai/task-queue.js'
import { keyManager } from '../preferences/key-manager.js'
import { startConnectionTest, type ConnectionTestRequest } from '../ai/connection-test.js'
import type { AiProvider, AiProviderInfo, ChatMessage } from '../ai/types.js'

const isAiProvider = (s: string): s is AiProvider => s === 'openai' || s === 'claude' || s === 'ollama'

type AiGenerateRequest = {
  prompt: string
  context: string
  provider: AiProvider
  model?: string
  baseUrl?: string
  messages?: ChatMessage[]
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
   * 测试连接 — 独立通道(P0-6 修复)
   *
   * 走 src/main/ai/connection-test.ts 的独立 service:
   * - 流式 delta 通过 ai:connTest:stream 推送
   * - 终态通过 ai:connTest:status 推送
   * - 不进 aiTaskQueue,不被 ai:listTasks 列出
   */
  ipcMain.handle(
    IPC.ai.connectionTest,
    (e: IpcMainInvokeEvent, req: ConnectionTestRequest) => {
      if (!isAiProvider(req.provider)) {
        return { ok: false, error: `unknown provider: ${req.provider}` }
      }
      return startConnectionTest(e, req)
    }
  )
}
