/**
 * agent-loop — 显式状态机 + 可切换拓扑(依赖注入)
 *
 * 设计(plan 硬约束):
 *   - 不直接 import provider/registry/git,全部构造时注入 {llm, tools, git, gate, ...}
 *   - 循环主体不随 autonomy mode 变化:是否暂停确认只问 gate.decide(risk)
 *   - 拓扑只切换 stage 编排(Planner / Executor / Critic),共用同一执行循环
 *
 * 状态流:Snapshot → [Plan] → (Executing → Gate → AwaitConfirm? → Observing)* → [Critic] → Done
 *         失败 / 取消 / 超步 → git 回滚 → Error / Cancelled
 */
import { analyzeReachability, type ReachabilityReport } from './decision-tree.js'
import { planFromText, type AgentPlan, type Topology } from './topology.js'
import type { LlmAdapter } from './llm-adapter.js'
import type { AutonomyGate, GateDecision } from './autonomy-gate.js'
import type { ToolRegistry } from './tool-registry.js'
import type { ToolCall, ToolContext, ToolResult, ToolRisk } from './types.js'
import type { ChatMessage } from '../types.js'
import type { ScriptNode } from '../../../shared/dsl/types.js'

export interface AgentGit {
  snapshot: (label: string) => Promise<{ ok: boolean; ref?: string; error?: string }>
  rollback: (ref?: string) => Promise<{ ok: boolean; error?: string }>
}

export interface ConfirmRequest {
  call: ToolCall
  risk: ToolRisk
  /** destructive 工具的 serialize 前后 diff 预览 */
  diff?: { before: string; after: string }
}

export type CriticReport =
  | { kind: 'deterministic'; reachability: ReachabilityReport }
  | { kind: 'llm'; text: string }

export type AgentStep =
  | { type: 'plan'; plan: AgentPlan }
  | { type: 'thought'; text: string }
  | { type: 'tool_call'; call: ToolCall; risk: ToolRisk; decision: GateDecision }
  | { type: 'awaiting_confirm'; call: ToolCall }
  | { type: 'tool_result'; result: ToolResult }
  | { type: 'critic'; report: CriticReport }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string }

export interface AgentRunRequest {
  goal: string
  system: string
  /** 预置多轮历史(可含组装好的上下文) */
  messages?: ChatMessage[]
}

export interface AgentRunResult {
  status: 'done' | 'error' | 'cancelled'
  steps: AgentStep[]
  finalText: string
  error?: string
  rolledBack?: boolean
}

export interface AgentLoopDeps {
  llm: LlmAdapter
  tools: ToolRegistry
  git: AgentGit
  gate: AutonomyGate
  topology: Topology
  toolContext: ToolContext
  requestConfirm?: (req: ConfirmRequest) => Promise<boolean>
  onStep?: (step: AgentStep) => void
  /** 确定性 critic 读取最终 AST(litePlanExecute);返回 null 跳过 */
  loadScriptAst?: () => Promise<ScriptNode | null>
  maxSteps?: number
  signal?: AbortSignal
}

const DEFAULT_MAX_STEPS = 30

class CancelledError extends Error {
  constructor() {
    super('cancelled')
    this.name = 'CancelledError'
  }
}

class MaxStepsError extends Error {
  constructor() {
    super('MAX_STEPS: agent 未在步数上限内完成')
    this.name = 'MaxStepsError'
  }
}

const CRITIC_SYSTEM =
  '你是质量审查员。基于刚才的修改与目标,简要指出是否达成、有无遗漏或风险。'

export const runAgent = async (
  req: AgentRunRequest,
  deps: AgentLoopDeps
): Promise<AgentRunResult> => {
  const steps: AgentStep[] = []
  const emit = (s: AgentStep): void => {
    steps.push(s)
    deps.onStep?.(s)
  }
  const ensureLive = (): void => {
    if (deps.signal?.aborted) throw new CancelledError()
  }

  const maxSteps = deps.maxSteps ?? DEFAULT_MAX_STEPS
  const snapshot = await deps.git.snapshot(`agent: ${req.goal}`)
  if (!snapshot.ok || !snapshot.ref) {
    const message = snapshot.error ?? 'git snapshot 失败:无有效回滚点,agent 已中止'
    emit({ type: 'error', message })
    return { status: 'error', steps, finalText: '', error: message, rolledBack: false }
  }
  const snapRef = snapshot.ref

  const chatOpts = { signal: deps.signal }

  try {
    ensureLive()

    // ---- Plan stage ----
    if (deps.topology.usePlanner) {
      const planResp = await deps.llm.chat({
        system: req.system,
        messages: [
          ...(req.messages ?? []),
          { role: 'user', content: `为达成以下目标制定简短分步计划(编号列表):\n${req.goal}` }
        ],
        tools: [],
        ...chatOpts
      })
      emit({ type: 'plan', plan: planFromText(planResp.text) })
    }

    // ---- Execute stage(ReAct)----
    const convo: ChatMessage[] = [...(req.messages ?? []), { role: 'user', content: req.goal }]
    const toolSchemas = deps.llm.supportsTools ? deps.tools.toJsonSchemas() : []
    let finalText = ''
    let completed = false

    for (let step = 0; step < maxSteps; step++) {
      ensureLive()
      const resp = await deps.llm.chat({
        system: req.system,
        messages: convo,
        tools: toolSchemas,
        ...chatOpts
      })
      if (resp.text) emit({ type: 'thought', text: resp.text })

      if (resp.toolCalls.length === 0) {
        finalText = resp.text
        completed = true
        break
      }

      convo.push({
        role: 'assistant',
        content: resp.text || `(调用工具: ${resp.toolCalls.map((c) => c.name).join(', ')})`
      })

      for (const toolCall of resp.toolCalls) {
        ensureLive()
        const def = deps.tools.get(toolCall.name)
        // 未知工具按最高风险处理(最安全),交给 registry 返回 UNKNOWN_TOOL
        const risk: ToolRisk = def?.risk ?? 'destructive'
        const decision = deps.gate.decide(risk)
        emit({ type: 'tool_call', call: toolCall, risk, decision })

       if (decision === 'confirm') {
         // preview 在 overlay fs 上重放(不落真盘),产出 before/after diff 供确认
         const diff = await deps.tools.preview(toolCall, deps.toolContext)
         emit({ type: 'awaiting_confirm', call: toolCall })
         const approved = deps.requestConfirm
           ? await deps.requestConfirm({ call: toolCall, risk, diff: diff ?? undefined })
           : false
         if (!approved) {
            const rejected: ToolResult = {
              id: toolCall.id,
              name: toolCall.name,
              ok: false,
              content: '用户拒绝执行该工具',
              error: { code: 'REJECTED', message: 'user rejected tool call' }
            }
            emit({ type: 'tool_result', result: rejected })
            convo.push({ role: 'user', content: `工具 ${toolCall.name} 结果: 用户拒绝执行` })
            continue
          }
        }

        const result = await deps.tools.execute(toolCall, deps.toolContext)
        emit({ type: 'tool_result', result })
        convo.push({ role: 'user', content: `工具 ${toolCall.name} 结果: ${result.content}` })
      }
    }

    if (!completed) throw new MaxStepsError()

    // ---- Critic stage ----
    if (deps.topology.criticKind === 'deterministic' && deps.loadScriptAst) {
      const ast = await deps.loadScriptAst()
      if (ast) {
        emit({ type: 'critic', report: { kind: 'deterministic', reachability: analyzeReachability(ast) } })
      }
    } else if (deps.topology.criticKind === 'llm') {
      const criticResp = await deps.llm.chat({
        system: CRITIC_SYSTEM,
        messages: [{ role: 'user', content: `目标:${req.goal}\n请审查刚才的修改。` }],
        tools: [],
        ...chatOpts
      })
      emit({ type: 'critic', report: { kind: 'llm', text: criticResp.text } })
    }

    emit({ type: 'done', text: finalText })
    return { status: 'done', steps, finalText }
  } catch (err) {
    if (err instanceof CancelledError) {
      const rb = await deps.git.rollback(snapRef)
      emit({ type: 'error', message: 'cancelled' })
      return { status: 'cancelled', steps, finalText: '', error: 'cancelled', rolledBack: rb.ok }
    }
    const message = err instanceof Error ? err.message : String(err)
    const rb = await deps.git.rollback(snapRef)
    emit({ type: 'error', message })
    return { status: 'error', steps, finalText: '', error: message, rolledBack: rb.ok }
  }
}
