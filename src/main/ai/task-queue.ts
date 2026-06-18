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
 * 取消 / 超时:
 *   cancel() 触发 AbortController.abort() → provider 底层请求真正中断
 *     (旧版只置标志位,流不停、token 照算)
 *   running 任务带 120s 超时兜底,防挂死连接永久阻塞并发=1 的队列
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
    const controller = new AbortController()
    const record: TaskRecord = {
      taskId,
      request: { ...request, signal: controller.signal },
      sender,
      status: 'pending',
      createdAt: Date.now()
    }
    activeControllers.set(taskId, controller)
    queue.push(record)
    sendStatus(sender, taskId, 'pending')
    void drain()
    return taskId
  },

  /**
   * 取消任务。
   *  - pending: 直接从队列移除,标记 error
   *  - running: 触发 AbortController.abort() — provider 底层请求真正中断
   *    (旧版只置 cancelRequested 标志,流不停、token 照算)
   *  - done/error: noop
   */
  cancel: (taskId: string): { ok: boolean; cancelled: boolean } => {
    const active = activeTasks.get(taskId)
    if (active) {
      if (active.status === 'running') {
        cancelRequested.add(taskId)
        const controller = activeControllers.get(taskId)
        controller?.abort()
        return { ok: true, cancelled: false }
      }
      return { ok: true, cancelled: false }
    }
    const idx = queue.findIndex((t) => t.taskId === taskId)
    if (idx >= 0) {
      const [removed] = queue.splice(idx, 1)
      activeControllers.delete(taskId)
      sendStatus(removed.sender, taskId, 'error', 'cancelled')
      recentTasks = [
        stripSender({ ...removed, status: 'error' as const, error: 'cancelled' }),
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

/** running 任务的 AbortController(取消 / 超时触发 abort,真正中断 provider 流) */
const activeControllers: Map<string, AbortController> = new Map()

/** running 任务超时阈值(ms) — 防挂死连接永久阻塞并发=1 的队列 */
const TASK_TIMEOUT_MS = 120_000


const archive = (record: TaskRecord): void => {
  recentTasks = [stripSender(record), ...recentTasks].slice(0, MAX_RECENT)
}

/**
 * 归档前剥离 sender:TaskRecord 持有的 WebContents 在浮出窗口关闭后是 dead 引用,
 * recentTasks 最多留 50 条,长期持有 dead WebContents 是泄漏。list() 只读标量字段,
 * 不需要 sender。
 */
const stripSender = (record: TaskRecord): TaskRecord => {
  const { sender: _sender, ...rest } = record
  void _sender
  return rest as TaskRecord
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

      // 超时兜底:120s 无结束则 abort,防挂死连接永久阻塞并发=1 的队列
      const timeoutTimer = setTimeout(() => {
        if (activeTasks.has(record.taskId)) {
          cancelRequested.add(record.taskId)
          activeControllers.get(record.taskId)?.abort()
        }
      }, TASK_TIMEOUT_MS)

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
        // AbortError(取消 / 超时触发)归为 cancelled 语义
        const isAbort = err instanceof Error && err.name === 'AbortError'
        record.status = 'error'
        record.error = isAbort
          ? cancelRequested.has(record.taskId)
            ? 'cancelled'
            : 'timeout'
          : err instanceof Error
            ? err.message
            : String(err)
        flushStreamImmediate(record.sender, record.taskId)
        sendStatus(record.sender, record.taskId, 'error', record.error)
      } finally {
        clearTimeout(timeoutTimer)
        // 清理 stream 缓冲器
        const entry = streamBuffers.get(record.taskId)
        if (entry?.timer !== null && entry?.timer !== undefined) {
          clearTimeout(entry.timer)
        }
        streamBuffers.delete(record.taskId)
        activeTasks.delete(record.taskId)
        activeControllers.delete(record.taskId)
        archive(record)
      }
    }
  } finally {
    draining = false
  }
}

let draining = false
