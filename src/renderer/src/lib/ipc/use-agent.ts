/**
 * use-agent — agent 任务 IPC 封装
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useErrorStore } from '../store'
import type { AiProvider } from './use-ai'

export type AgentStep =
  | { type: 'plan'; plan: { steps: Array<{ index: number; description: string }>; raw: string } }
  | { type: 'thought'; text: string }
  | { type: 'tool_call'; call: { id: string; name: string; args: unknown }; risk: string; decision: string }
  | { type: 'awaiting_confirm'; call: { id: string; name: string; args: unknown } }
  | { type: 'tool_result'; result: { name: string; ok: boolean; content: string } }
  | { type: 'critic'; report: CriticReport }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string }

export interface ReachabilityReport {
  entry: string | null
  reachable: string[]
  unreachable: string[]
  danglingTargets: Array<{ from: string; target: string }>
}

export type CriticReport =
  | { kind: 'deterministic'; reachability: ReachabilityReport }
  | { kind: 'llm'; text: string }

export type AgentTaskStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled'

export type AgentConfirmRequest = {
  taskId: string
  confirmId: string
  call: { id: string; name: string; args: unknown }
  risk: string
  diff?: { before: string; after: string }
}

export const useAgent = () => {
  return {
    start: useCallback(
      (req: {
        goal: string
        projectPath: string
        selectedSceneId?: string | null
        activeScriptFile?: string | null
        provider?: AiProvider
        model?: string
        baseUrl?: string
      }) => wrap('ai:agent:start', () => window.galide.ai.agent.start(req)),
      []
    ),
    cancel: useCallback(
      (taskId: string) => wrap('ai:agent:cancel', () => window.galide.ai.agent.cancel(taskId)),
      []
    ),
    confirm: useCallback(
      (confirmId: string, approved: boolean) =>
        wrap('ai:agent:confirm', () => window.galide.ai.agent.confirm({ confirmId, approved })),
      []
    )
  }
}

const wrap = async <T>(source: string, fn: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await fn()
  } catch (err) {
    useErrorStore.getState().push({
      code: 'IPC_ERROR',
      message: err instanceof Error ? err.message : String(err),
      source
    })
    return undefined
  }
}

/** 订阅 agent 步骤流 + 状态 + 确认请求 */
export const useAgentRun = (taskId: string | null): {
  steps: AgentStep[]
  status: AgentTaskStatus | null
  error: string | null
  pendingConfirm: AgentConfirmRequest | null
  clearConfirm: () => void
} => {
  const [steps, setSteps] = useState<AgentStep[]>([])
  const [status, setStatus] = useState<AgentTaskStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<AgentConfirmRequest | null>(null)
  const taskIdRef = useRef(taskId)

  useEffect(() => {
    taskIdRef.current = taskId
    setSteps([])
    setStatus(null)
    setError(null)
    setPendingConfirm(null)
  }, [taskId])

  useEffect(() => {
    if (!taskId) return
    const offStep = window.galide.ai.agent.onStep((evt) => {
      if (evt.taskId !== taskIdRef.current) return
      setSteps((s) => [...s, evt.step as AgentStep])
    })
    const offStatus = window.galide.ai.agent.onStatus((evt) => {
      if (evt.taskId !== taskIdRef.current) return
      setStatus(evt.status as AgentTaskStatus)
      if (evt.error) setError(evt.error)
    })
    const offConfirm = window.galide.ai.agent.onConfirmRequest((evt) => {
      if (evt.taskId !== taskIdRef.current) return
      setPendingConfirm(evt)
    })
    return () => {
      offStep()
      offStatus()
      offConfirm()
    }
  }, [taskId])

  return {
    steps,
    status,
    error,
    pendingConfirm,
    clearConfirm: () => setPendingConfirm(null)
  }
}
