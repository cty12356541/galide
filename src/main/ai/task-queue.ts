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

/**
 * Stream 缓冲器 — 累积 provider 吐来的小 delta,定时 / 定量 flush 一次
 *
 * 目的:provider (尤其 OpenAI SDK + minimaxi / deepseek) 经常一次吐一大坨
 * (几十字符 burst),如果直接逐 IPC 转发,renderer 端 `text` 一次性 +N,
 * 字符级 typewriter 来不及逐字展开,用户视觉上"一下子冒出来"。
 *
 * 策略:
 *  - 累积同一个 taskId 的 delta 字符进 buffer
 *  - 满足任一条件就 flush:
 *    (a) buffer 长度 >= FLUSH_CHARS (12 字符)
 *    (b) 自上次 flush 起 >= FLUSH_MS (25ms)
 *    (c) 流结束 / 错误 / cancel (立即 flush 剩余)
 *  - flush 时合并 buffer 一次 IPC.send
 *
 * 这样保证:provider burst 几十字符 → 多个小批 (12 chars / 25ms) → renderer
 * typewriter 能逐字展开。视觉上"AI 在思考 / 写作"感。
 */
const FLUSH_CHARS = 12
const FLUSH_MS = 25

const streamBuffers = new Map<string, { buffer: string; timer: NodeJS.Timeout | null }>()

const flushStream = (sender: WebContents, taskId: string): void => {
  const entry = streamBuffers.get(taskId)
  if (!entry || entry.buffer.length === 0) return
  const payload = entry.buffer
  entry.buffer = ''
  if (entry.timer !== null) {
    clearTimeout(entry.timer)
    entry.timer = null
  }
  if (isSenderAlive(sender)) {
    sender.send(IPC.ai.stream, { taskId, delta: payload })
  }
}

const scheduleFlush = (sender: WebContents, taskId: string): void => {
  const entry = streamBuffers.get(taskId)
  if (!entry) return
  if (entry.timer !== null) return
  entry.timer = setTimeout(() => {
    flushStream(sender, taskId)
  }, FLUSH_MS)
}

const sendDelta = (sender: WebContents, taskId: string, delta: string): void => {
  if (!delta) return
  if (!isSenderAlive(sender)) return
  let entry = streamBuffers.get(taskId)
  if (!entry) {
    entry = { buffer: '', timer: null }
    streamBuffers.set(taskId, entry)
  }
  entry.buffer += delta
  // 定量阈值:够了立刻 flush
  if (entry.buffer.length >= FLUSH_CHARS) {
    flushStream(sender, taskId)
    return
  }
  // 否则按时间阈值 schedule
  scheduleFlush(sender, taskId)
}

/**
 * 流结束 / 错误 / 取消时调用,确保 buffer 残余全 flush。
 */
export const flushStreamImmediate = (sender: WebContents, taskId: string): void => {
  flushStream(sender, taskId)
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
            // 错误:把 buffer 残余先 flush,再发 status
            flushStreamImmediate(record.sender, record.taskId)
            sendStatus(
              record.sender,
              record.taskId,
              'error',
              `${chunk.error.code}: ${chunk.error.message}`
            )
          }
        })
        // 流结束 — flush buffer 残余,renderer 端会看到完整 text
        flushStreamImmediate(record.sender, record.taskId)
        // give a tiny yield so cancel() between chunks is observed promptly
        await sleep(0)

        if (cancelRequested.has(record.taskId)) {
          cancelRequested.delete(record.taskId)
          record.status = 'error'
          record.error = 'cancelled'
          // cancel 时也 flush(剩余 buffer 仍到达 UI)
          flushStreamImmediate(record.sender, record.taskId)
          sendStatus(record.sender, record.taskId, 'error', 'cancelled')
        } else {
          record.status = 'done'
          sendStatus(record.sender, record.taskId, 'done')
        }
      } catch (err) {
        record.status = 'error'
        record.error = err instanceof Error ? err.message : String(err)
        flushStreamImmediate(record.sender, record.taskId)
        sendStatus(record.sender, record.taskId, 'error', record.error)
      } finally {
        // 清理 stream 缓冲器
        const entry = streamBuffers.get(record.taskId)
        if (entry?.timer !== null && entry?.timer !== undefined) {
          clearTimeout(entry.timer)
        }
        streamBuffers.delete(record.taskId)
        activeTasks.delete(record.taskId)
        archive(record)
      }
    }
  } finally {
    draining = false
  }
}

let draining = false