import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'
import type { AiRequest } from './types.js'
import { aiProxy } from './ai-proxy.js'

/**
 * AI 任务状态机:FIFO 队列 + 并发 = 1
 *
 * 生命周期:
 *   pending → running → done
 *                     → error
 *
 * 触发事件:
 *   enqueue()         → taskId 立即返回,任务进入 pending
 *   status: pending   → 推送给 sender
 *   status: running   → 推送给 sender
 *   stream: delta     → 逐 token 推送给 sender
 *   status: done      → 推送给 sender
 *   status: error     → 推送给 sender(带 error message)
 *
 * 设计依据:`core/conventions.yaml:22` AI 任务入队,UI 显示排队状态,
 * 不阻塞编辑器操作。
 */

export type AiTaskStatus = 'pending' | 'running' | 'done' | 'error'

export type TaskRecord = {
  taskId: string
  request: AiRequest
  sender: WebContents
  status: AiTaskStatus
  error?: string
  createdAt: number
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const isSenderAlive = (sender: WebContents): boolean => !sender.isDestroyed()

const sendStatus = (sender: WebContents, taskId: string, status: AiTaskStatus, error?: string): void => {
  if (!isSenderAlive(sender)) return
  sender.send(IPC.ai.status, error ? { taskId, status, error } : { taskId, status })
}

const sendDelta = (sender: WebContents, taskId: string, delta: string): void => {
  if (!delta) return
  if (!isSenderAlive(sender)) return
  sender.send(IPC.ai.stream, { taskId, delta })
}

export const aiTaskQueue = {
  /**
   * 任务快照(供 listTasks IPC 使用)
   * 返回当前活跃 + 最近的已完成任务
   */
  list: (): Array<{
    taskId: string
    status: AiTaskStatus
    prompt: string
    provider: AiRequest['provider']
    error?: string
    createdAt: number
  }> => {
    const all = [...activeTasks.values(), ...recentTasks]
    return all.map((t) => ({
      taskId: t.taskId,
      status: t.status,
      prompt: t.request.prompt,
      provider: t.request.provider,
      error: t.error,
      createdAt: t.createdAt
    }))
  },

  /**
   * 入队一个新任务,立即返回 taskId。
   * 不 await — 调用方应通过 ai:status / ai:stream 事件监听结果。
   */
  enqueue: (request: AiRequest, sender: WebContents): string => {
    const taskId = randomUUID()
    const record: TaskRecord = {
      taskId,
      request,
      sender,
      status: 'pending',
      createdAt: Date.now()
    }
    queue.push(record)
    sendStatus(sender, taskId, 'pending')
    void drain()
    return taskId
  },

  /**
   * 取消任务。如果任务还在 pending,直接标记为 error 跳过;
   * 如果正在 running,标记 cancel 请求,provider 在下一个 chunk 边界终止。
   * 已 done/error 的任务 noop。
   */
  cancel: (taskId: string): { ok: boolean; cancelled: boolean } => {
    const active = activeTasks.get(taskId)
    if (active) {
      if (active.status === 'running') {
        cancelRequested.add(taskId)
        return { ok: true, cancelled: false }
      }
      return { ok: true, cancelled: false }
    }
    const idx = queue.findIndex((t) => t.taskId === taskId)
    if (idx >= 0) {
      const [removed] = queue.splice(idx, 1)
      sendStatus(removed.sender, taskId, 'error', 'cancelled')
      recentTasks = [
        { ...removed, status: 'error' as const, error: 'cancelled' },
        ...recentTasks
      ].slice(0, MAX_RECENT)
      return { ok: true, cancelled: true }
    }
    return { ok: false, cancelled: false }
  }
}

const queue: TaskRecord[] = []
const activeTasks: Map<string, TaskRecord> = new Map()
const cancelRequested: Set<string> = new Set()
const MAX_RECENT = 50
let recentTasks: TaskRecord[] = []

const archive = (record: TaskRecord): void => {
  recentTasks = [record, ...recentTasks].slice(0, MAX_RECENT)
}

const drain = async (): Promise<void> => {
  if (draining) return
  draining = true
  try {
    while (queue.length > 0) {
      const record = queue.shift()
      if (!record) break
      if (cancelRequested.has(record.taskId)) {
        cancelRequested.delete(record.taskId)
        record.status = 'error'
        record.error = 'cancelled'
        sendStatus(record.sender, record.taskId, 'error', 'cancelled')
        archive(record)
        continue
      }
      record.status = 'running'
      activeTasks.set(record.taskId, record)
      sendStatus(record.sender, record.taskId, 'running')

      try {
        await aiProxy.generate(record.request, (chunk) => {
          if (cancelRequested.has(record.taskId)) return
          if (chunk.type === 'delta' && chunk.text) {
            sendDelta(record.sender, record.taskId, chunk.text)
            return
          }
          if (chunk.type === 'error' && chunk.error) {
            sendStatus(
              record.sender,
              record.taskId,
              'error',
              `${chunk.error.code}: ${chunk.error.message}`
            )
          }
        })
        // give a tiny yield so cancel() between chunks is observed promptly
        await sleep(0)

        if (cancelRequested.has(record.taskId)) {
          cancelRequested.delete(record.taskId)
          record.status = 'error'
          record.error = 'cancelled'
          sendStatus(record.sender, record.taskId, 'error', 'cancelled')
        } else {
          record.status = 'done'
          sendStatus(record.sender, record.taskId, 'done')
        }
      } catch (err) {
        record.status = 'error'
        record.error = err instanceof Error ? err.message : String(err)
        sendStatus(record.sender, record.taskId, 'error', record.error)
      } finally {
        activeTasks.delete(record.taskId)
        archive(record)
      }
    }
  } finally {
    draining = false
  }
}

let draining = false