import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { IPC } from '../../shared/ipc-channels.js'
import { aiProxy } from '../ai/ai-proxy.js'
import { aiTaskQueue } from '../ai/task-queue.js'
import { keyManager } from '../preferences/key-manager.js'
import { startConnectionTest } from '../ai/connection-test.js'
import type { AiProviderInfo } from '../ai/types.js'
import {
  parseIpcArgs,
  ipcSchemaFailure,
  AiGenerateSchema,
  AiSetConfigSchema,
  AiConnectionTestSchema,
  ApiKeyProviderSchema
} from './schemas/index.js'

type AiListTasksResult = {
  tasks: Array<{
    taskId: string
    status: 'pending' | 'running' | 'done' | 'error'
    prompt: string
    provider: string
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
    async (_e: IpcMainInvokeEvent, raw: unknown) => {
      try {
        const config = parseIpcArgs('ai:setConfig', AiSetConfigSchema, raw)
        aiProxy.setConfig(config)
        return { ok: true }
      } catch (err) {
        return ipcSchemaFailure(err)
      }
    }
  )

  /**
   * 入队 AI 生成任务,立即返回 taskId。
   * 流式 delta 通过 ai:stream 推送,状态变化通过 ai:status 推送。
   */
  ipcMain.handle(
    IPC.ai.generate,
    async (e, raw: unknown): Promise<{ taskId: string; status: 'pending' }> => {
      const req = parseIpcArgs('ai:generate', AiGenerateSchema, raw)
      const cfg = aiProxy.getConfig()
      // baseUrl 与 model 同规则:请求未显式指定时回退到全局 AI 配置
      // (否则 OpenAI 兼容端点会收到工厂默认 gpt-4o-mini → 404)
      const effectiveBaseUrl = req.baseUrl ?? cfg.baseUrl
      const effectiveModel = req.model ?? cfg.model
      const taskId = aiTaskQueue.enqueue(
        { ...req, baseUrl: effectiveBaseUrl, ...(effectiveModel ? { model: effectiveModel } : {}) },
        e.sender
      )
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

  ipcMain.handle(
    IPC.ai.keySet,
    async (_e: IpcMainInvokeEvent, raw: unknown): Promise<{ ok: boolean; error?: string }> => {
      try {
        const { provider, key } = parseIpcArgs('ai:keySet', z.object({
          provider: ApiKeyProviderSchema,
          key: z.string().min(1, 'API Key 不能为空')
        }), raw)
        keyManager.set(provider, key)
        return { ok: true }
      } catch (err) {
        return ipcSchemaFailure(err)
      }
    }
  )

  ipcMain.handle(
    IPC.ai.keyDelete,
    async (_e: IpcMainInvokeEvent, raw: unknown): Promise<{ ok: boolean; error?: string }> => {
      try {
        const { provider } = parseIpcArgs('ai:keyDelete', z.object({
          provider: ApiKeyProviderSchema
        }), raw)
        keyManager.delete(provider)
        return { ok: true }
      } catch (err) {
        return ipcSchemaFailure(err)
      }
    }
  )

  ipcMain.handle(
    IPC.ai.keyHas,
    async (_e: IpcMainInvokeEvent, raw: unknown): Promise<boolean> => {
      const { provider } = parseIpcArgs('ai:keyHas', z.object({
        provider: ApiKeyProviderSchema
      }), raw)
      return keyManager.has(provider)
    }
  )

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
    (e: IpcMainInvokeEvent, raw: unknown) => {
      try {
        const req = parseIpcArgs('ai:connectionTest', AiConnectionTestSchema, raw)
        return startConnectionTest(e, req)
      } catch (err) {
        return ipcSchemaFailure(err)
      }
    }
  )
}
