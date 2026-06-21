import { useCallback, useEffect, useRef, useState } from 'react'
import { useErrorStore } from '../store'

export type AiProvider = 'openai' | 'claude' | 'ollama'

export type AiTaskStatusValue = 'pending' | 'running' | 'done' | 'error'

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type AiGenerateRequest = {
  prompt: string
  context: string
  provider: AiProvider
  model?: string
  baseUrl?: string
  /** 多轮对话历史(含本轮用户输入) */
  messages?: ChatMessage[]
}

export type AiGenerateResponse = {
  taskId: string
  status: 'pending'
}

export type AiTaskInfo = {
  taskId: string
  status: AiTaskStatusValue
  prompt: string
  provider: AiProvider
  error?: string
  createdAt: number
}

export type AiStreamChunk = {
  taskId: string
  delta: string
}

export type AiTaskStatusEvent = {
  taskId: string
  status: AiTaskStatusValue
  error?: string
}

const pushError = (source: string, err: unknown): void => {
  useErrorStore.getState().push({
    code: 'IPC_ERROR',
    message: err instanceof Error ? err.message : String(err),
    source
  })
}

/**
 * 入队 AI 生成任务,返回 taskId。
 * 流式 delta 通过 useAiStream(taskId) 订阅,状态通过 useAiTaskStatus(taskId) 订阅。
 */
export const useAi = () => {
  return {
    generate: useCallback(
      (req: AiGenerateRequest): Promise<AiGenerateResponse | undefined> =>
        wrap<AiGenerateResponse>('ai:generate', () => window.galide.ai.generate(req)),
      []
    ),
    cancel: useCallback(
      (taskId: string) =>
        wrap<{ ok: boolean; cancelled: boolean }>('ai:cancel', () => window.galide.ai.cancel(taskId)),
      []
    ),
    listTasks: useCallback(
      () =>
        wrap<{ tasks: AiTaskInfo[] }>('ai:listTasks', () => window.galide.ai.listTasks()),
      []
    ),
    listProviders: useCallback(
      () => wrap('ai:listProviders', () => window.galide.ai.listProviders()),
      []
    ),
    getConfig: useCallback(
      () => wrap('ai:getConfig', () => window.galide.ai.getConfig()),
      []
    ),
    setConfig: useCallback(
      (config: { provider: AiProvider; baseUrl?: string; model?: string }) =>
        wrap('ai:setConfig', () => window.galide.ai.setConfig(config)),
      []
    )
  }
}

const wrap = async <T>(source: string, fn: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await fn()
  } catch (err) {
    pushError(source, err)
    return undefined
  }
}

/**
 * 订阅指定 taskId 的流式 delta。
 *
 * 返回值:
 *   - text: 已累积的全文(每个 chunk 自动 append)
 *   - done: 是否已 done(成功完成)
 *   - error: 错误 message(若有)
 *   - status: 当前状态(pending | running | done | error)
 *   - append: 用于手动注入 delta 的工具(很少用,主要供测试)
 *   - reset: 清空累积文本
 *
 * 注意:也接收该 task 的状态事件 — 任何 ai:status 事件都更新 status / error / done。
 */
export const useAiStream = (taskId: string | null): {
  text: string
  done: boolean
  error: string | null
  status: AiTaskStatusValue | null
  append: (delta: string) => void
  reset: () => void
} => {
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<AiTaskStatusValue | null>(null)
  const taskIdRef = useRef<string | null>(taskId)

  useEffect(() => {
    taskIdRef.current = taskId
    setText('')
    setDone(false)
    setError(null)
    setStatus(null)
  }, [taskId])

  useEffect(() => {
    if (!taskId) return

    const offStream = window.galide.ai.stream((chunk) => {
      if (chunk.taskId !== taskIdRef.current) return
      if (chunk.delta) {
        setText((prev) => prev + chunk.delta)
      }
    })

    const offStatus = window.galide.ai.onStatus((evt) => {
      if (evt.taskId !== taskIdRef.current) return
      setStatus(evt.status as AiTaskStatusValue)
      if (evt.status === 'done') {
        setDone(true)
      } else if (evt.status === 'error') {
        setDone(true)
        setError(evt.error ?? 'unknown error')
      }
    })

    return () => {
      offStream()
      offStatus()
    }
  }, [taskId])

  const append = useCallback((delta: string) => {
    if (!delta) return
    setText((prev) => prev + delta)
  }, [])

  const reset = useCallback(() => {
    setText('')
    setDone(false)
    setError(null)
    setStatus(null)
  }, [])

  return { text, done, error, status, append, reset }
}

/**
 * 订阅指定 taskId 的状态(pending → running → done/error)。
 * 不接收 stream delta — 单独监听状态变化,适合显示排队指示器。
 */
export const useAiTaskStatus = (taskId: string | null): {
  status: AiTaskStatusValue | null
  error: string | null
  done: boolean
} => {
  const [status, setStatus] = useState<AiTaskStatusValue | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const taskIdRef = useRef<string | null>(taskId)

  useEffect(() => {
    taskIdRef.current = taskId
    setStatus(null)
    setError(null)
    setDone(false)
  }, [taskId])

  useEffect(() => {
    if (!taskId) return
    const off = window.galide.ai.onStatus((evt) => {
      if (evt.taskId !== taskIdRef.current) return
      setStatus(evt.status as AiTaskStatusValue)
      if (evt.status === 'done') {
        setDone(true)
      } else if (evt.status === 'error') {
        setDone(true)
        setError(evt.error ?? 'unknown error')
      }
    })
    return off
  }, [taskId])

  return { status, error, done }
}

/**
 * 列出当前 main 端持有的所有 AI 任务快照。
 * 不自动刷新 — 组件若需要实时更新,自己加 polling。
 */
export const useAiTaskList = () => {
  const ai = useAi()
  return useCallback(async (): Promise<AiTaskInfo[]> => {
    const r = await ai.listTasks()
    return r?.tasks ?? []
  }, [ai])
}