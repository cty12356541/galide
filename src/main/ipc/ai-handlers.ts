import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'
import { aiProxy } from '../ai/ai-proxy.js'
import { aiTaskQueue } from '../ai/task-queue.js'
import type { AiProvider } from '../ai/types.js'

type AiGenerateRequest = {
  prompt: string
  context: string
  provider: AiProvider
  model?: string
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

export const registerAiHandlers = (): void => {
  ipcMain.handle(IPC.ai.listProviders, async () => {
    return aiProxy.listProviders()
  })

  ipcMain.handle(IPC.ai.getConfig, async () => {
    return aiProxy.getConfig()
  })

  ipcMain.handle(IPC.ai.setConfig, async (_e, config: { provider: string; baseUrl?: string; model?: string }) => {
    aiProxy.setConfig(config as never)
    return { ok: true }
  })

  /**
   * 入队 AI 生成任务,立即返回 taskId。
   * 流式 delta 通过 ai:stream 推送,状态变化通过 ai:status 推送。
   */
  ipcMain.handle(
    IPC.ai.generate,
    async (e, req: AiGenerateRequest): Promise<{ taskId: string; status: 'pending' }> => {
      const taskId = aiTaskQueue.enqueue(req, e.sender)
      return { taskId, status: 'pending' }
    }
  )

  ipcMain.handle(IPC.ai.cancel, async (_e, taskId: string) => {
    return aiTaskQueue.cancel(taskId)
  })

  ipcMain.handle(IPC.ai.listTasks, async (): Promise<AiListTasksResult> => {
    // task-queue.list() 内部已用 task.request.provider(类型 AiProvider),
    // 这里显式 map 一遍保证 AiListTasksResult 的 provider 字段是窄联合,
    // 避免通过 IPC 序列化后被推断为 string
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
}