/**
 * use-agent-activity — 全局 agent 活动状态(running/idle/error)
 *
 * 订阅 main 端 ai:agent:status 广播(agent-service.ts → IPC.ai.agent.status),
 * 供 StatusBar 等无 taskId 上下文的组件观察「是否有 agent 在跑」。
 * 与 useAgentRun(单任务步骤流)不同,本 hook 跟踪最近一次任务级状态。
 */
import { useEffect, useState } from 'react'
import type { AgentTaskStatus } from './use-agent'

export type AgentActivity = 'idle' | 'running' | 'error'

const toActivity = (status: AgentTaskStatus): AgentActivity => {
  if (status === 'running' || status === 'pending') return 'running'
  if (status === 'error') return 'error'
  return 'idle'
}

export const useAgentActivity = (): AgentActivity => {
  const [activity, setActivity] = useState<AgentActivity>('idle')

  useEffect(() => {
    const off = window.galide.ai.agent.onStatus((evt) => {
      setActivity(toActivity(evt.status as AgentTaskStatus))
    })
    return off
  }, [])

  return activity
}
