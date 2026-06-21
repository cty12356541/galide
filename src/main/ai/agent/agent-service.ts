/**
 * agent-service — agent 任务编排(main 中心)
 *
 * 挂在独立 agent 队列上(并发=1),组装 context / tools / llm / gate / git,
 * 步骤经 ai:agent:step 推送;destructive 工具经 ai:agent:confirm 往返。
 */
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { WebContents } from 'electron'
import { IPC } from '../../../shared/ipc-channels.js'
import { runAgent, type AgentStep, type ConfirmRequest } from './agent-loop.js'
import { createAgentGit } from './agent-git.js'
import { buildContext } from './context-engine.js'
import { createAutonomyGate } from './autonomy-gate.js'
import { createLlmAdapter } from './llm-adapter.js'
import { TOPOLOGIES } from './topology.js'
import { createDefaultToolRegistry } from './create-default-registry.js'
import { getPreference } from '../../preferences/preferences-store.js'
import { aiProxy } from '../ai-proxy.js'
import { gitService } from '../../git/git-service.js'
import { createBroadcastingWriteFile } from '../../ipc/script-broadcast.js'
import { parse } from '../../../shared/dsl/parser.js'
import type { AiProvider } from '../types.js'
import type { ToolDispatch } from './types.js'
import { resolveActiveGalFile } from './resolve-active-gal.js'

export type AgentTaskStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled'

export interface AgentStartRequest {
  goal: string
  projectPath: string
  selectedSceneId?: string | null
  activeScriptFile?: string | null
  provider?: AiProvider
  model?: string
  baseUrl?: string
}

type AgentTaskRecord = {
  taskId: string
  sender: WebContents
  status: AgentTaskStatus
  error?: string
  createdAt: number
  steps: AgentStep[]
}

const AGENT_SYSTEM =
  '你是 Galide 创作平台的 AI agent。你可以调用工具读写 .gal 剧本、分析决策树、生成立绘/语音、执行 IDE 命令。' +
  '优先使用工具完成用户目标,完成后用简短中文总结。'

const pendingConfirms = new Map<
  string,
  { resolve: (approved: boolean) => void; timer: NodeJS.Timeout }
>()

const pendingDispatches = new Map<
  string,
  { resolve: (r: { ok: boolean; error?: string }) => void; timer: NodeJS.Timeout }
>()

const sendStatus = (
  sender: WebContents,
  taskId: string,
  status: AgentTaskStatus,
  error?: string
): void => {
  if (sender.isDestroyed()) return
  sender.send(IPC.ai.agent.status, error ? { taskId, status, error } : { taskId, status })
}

const sendStep = (sender: WebContents, taskId: string, step: AgentStep): void => {
  if (sender.isDestroyed()) return
  sender.send(IPC.ai.agent.step, { taskId, step })
}

const createDispatch = (sender: WebContents): ToolDispatch => {
  return async (commandId: string) => {
    const requestId = randomUUID()
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingDispatches.delete(requestId)
        resolve({ ok: false, error: 'dispatch timeout' })
      }, 15_000)
      pendingDispatches.set(requestId, { resolve, timer })
      sender.send(IPC.agent.dispatchCommand, { requestId, commandId })
    })
  }
}

const readGalScript = async (
  projectPath: string,
  activeScriptFile?: string | null
): Promise<string | null> => {
  try {
    const files = (await fs.readdir(projectPath)).filter((f) => f.endsWith('.gal'))
    const target = resolveActiveGalFile(activeScriptFile, files)
    if (!target) return null
    return await fs.readFile(join(projectPath, target), 'utf-8')
  } catch {
    return null
  }
}

const queue: Array<{ taskId: string; req: AgentStartRequest; sender: WebContents; controller: AbortController }> = []
const active = new Map<string, AgentTaskRecord>()
const runningControllers = new Map<string, AbortController>()
let recent: AgentTaskRecord[] = []
let draining = false

export const agentService = {
  resolveConfirm: (confirmId: string, approved: boolean): boolean => {
    const pending = pendingConfirms.get(confirmId)
    if (!pending) return false
    clearTimeout(pending.timer)
    pendingConfirms.delete(confirmId)
    pending.resolve(approved)
    return true
  },

  resolveDispatch: (requestId: string, result: { ok: boolean; error?: string }): boolean => {
    const pending = pendingDispatches.get(requestId)
    if (!pending) return false
    clearTimeout(pending.timer)
    pendingDispatches.delete(requestId)
    pending.resolve(result)
    return true
  },

  start: (req: AgentStartRequest, sender: WebContents): string => {
    const taskId = randomUUID()
    const controller = new AbortController()
    queue.push({ taskId, req, sender, controller })
    active.set(taskId, { taskId, sender, status: 'pending', createdAt: Date.now(), steps: [] })
    sendStatus(sender, taskId, 'pending')
    void drain()
    return taskId
  },

  cancel: (taskId: string): { ok: boolean; cancelled: boolean } => {
    const idx = queue.findIndex((t) => t.taskId === taskId)
    if (idx >= 0) {
      const [removed] = queue.splice(idx, 1)
      sendStatus(removed.sender, taskId, 'cancelled')
      active.delete(taskId)
      return { ok: true, cancelled: true }
    }
    const ctrl = runningControllers.get(taskId)
    if (ctrl) {
      ctrl.abort()
      return { ok: true, cancelled: false }
    }
    return { ok: false, cancelled: false }
  },

  list: (): AgentTaskRecord[] => [...active.values(), ...recent]
}

const drain = async (): Promise<void> => {
  if (draining) return
  draining = true
  try {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break
      const record = active.get(item.taskId)
      if (!record) continue
      record.status = 'running'
      sendStatus(item.sender, item.taskId, 'running')
      runningControllers.set(item.taskId, item.controller)

      try {
      const agentPrefs = getPreference('agent')
      const aiConfig = aiProxy.getConfig()
      const provider = item.req.provider ?? aiConfig.provider
      const ctx = await buildContext(
        {
          projectPath: item.req.projectPath,
          selectedSceneId: item.req.selectedSceneId
        },
        {
          fs: {
            readFile: (p) => fs.readFile(p, 'utf-8'),
            readdir: (p) => fs.readdir(p)
          },
          git: {
            diff: (pp) => gitService.diff(pp, '')
          }
        }
      )

      const requestConfirm = async (cr: ConfirmRequest): Promise<boolean> => {
        const confirmId = randomUUID()
        item.sender.send(IPC.ai.agent.confirmRequest, {
          taskId: item.taskId,
          confirmId,
          call: cr.call,
          risk: cr.risk,
          diff: cr.diff
        })
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            pendingConfirms.delete(confirmId)
            resolve(false)
          }, 120_000)
          pendingConfirms.set(confirmId, { resolve, timer })
        })
      }

      const toolContext = {
        projectPath: item.req.projectPath,
        fs: {
          readFile: (p: string) => fs.readFile(p, 'utf-8'),
          writeFile: createBroadcastingWriteFile(item.req.projectPath, (p, c) =>
            fs.writeFile(p, c, 'utf-8')
          ),
          readdir: (p: string) => fs.readdir(p)
        },
        dispatch: createDispatch(item.sender)
      }

      const baseUrl = item.req.baseUrl ?? aiConfig.baseUrl
      const result = await runAgent(
        {
          goal: item.req.goal,
          system: `${AGENT_SYSTEM}\n\n${ctx.text}`,
          messages: []
        },
        {
          llm: createLlmAdapter(provider, item.req.model ?? aiConfig.model, baseUrl),
          tools: createDefaultToolRegistry(),
          git: createAgentGit(item.req.projectPath),
          gate: createAutonomyGate(agentPrefs.autonomy),
          topology: TOPOLOGIES[agentPrefs.topology],
          toolContext,
          requestConfirm,
          maxSteps: agentPrefs.maxSteps,
          signal: item.controller.signal,
          onStep: (step) => {
            record.steps.push(step)
            sendStep(item.sender, item.taskId, step)
          },
          loadScriptAst: async () => {
            const src = await readGalScript(item.req.projectPath, item.req.activeScriptFile)
            if (!src) return null
            const parsed = parse(src)
            return parsed.ok ? parsed.value : null
          }
        }
      )

      record.status = result.status === 'done' ? 'done' : result.status === 'cancelled' ? 'cancelled' : 'error'
      if (result.error) record.error = result.error
      sendStatus(item.sender, item.taskId, record.status, result.error)
      active.delete(item.taskId)
      recent = [record, ...recent].slice(0, 20)
      } finally {
        runningControllers.delete(item.taskId)
      }
    }
  } finally {
    draining = false
  }
}
