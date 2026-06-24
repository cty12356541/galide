/**
 * agent-handlers — ai:agent IPC + agent:dispatchCommand 往返
 */
import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'
import { agentService, type AgentStartRequest } from '../ai/agent/agent-service.js'
import { AgentStartSchema } from './schemas/index.js'
import { parseIpcArgs } from './schemas/index.js'
import type { AiProvider } from '../ai/types.js'

const isAiProvider = (s: string): s is AiProvider =>
  s === 'openai' || s === 'claude'

export const registerAgentHandlers = (): void => {
  ipcMain.handle(IPC.ai.agent.start, (e, raw: unknown) => {
    const req = parseIpcArgs('ai:agent:start', AgentStartSchema, raw) as AgentStartRequest
    if (req.provider && !isAiProvider(req.provider)) {
      return { ok: false as const, error: `unknown provider: ${req.provider}` }
    }
    const taskId = agentService.start(req, e.sender)
    return { ok: true as const, taskId, status: 'pending' as const }
  })

  ipcMain.handle(IPC.ai.agent.cancel, (_e, taskId: string) => agentService.cancel(taskId))

  ipcMain.handle(
    IPC.ai.agent.confirm,
    (_e, payload: { confirmId: string; approved: boolean }) => {
      const ok = agentService.resolveConfirm(payload.confirmId, payload.approved)
      return { ok }
    }
  )

  ipcMain.handle(
    IPC.agent.dispatchResult,
    (_e, payload: { requestId: string; ok: boolean; error?: string }) => {
      const ok = agentService.resolveDispatch(payload.requestId, {
        ok: payload.ok,
        error: payload.error
      })
      return { ok }
    }
  )
}
