/**
 * agent-loop — 显式状态机 + 可切换拓扑(依赖注入)
 *
 * 设计(plan 硬约束):
 *   - 不直接 import provider/registry/git,全部构造时注入 {llm, tools, git, gate, ...}
 *   - 循环主体不随 autonomy mode 变化:是否暂停确认只问 gate.decide(risk)
 *   - 拓扑只切换 stage 编排(Planner / Executor / Critic),共用同一执行循环
 *
 * 状态流(DAG,非单链):
 *   Snapshot + Context ──fan-in──► [Plan] ──► Execute ◄──┐
 *                                    │         │  │       │ retry(maxReplan/criticFix)
 *                                    │         ▼  ▼       │
 *                                    │       Gate→Tools───┘
 *                                    │         │
 *                                    └──► Critic(det[/llm]) ──► Done
 *         失败 / 取消 / 超步 → git 回滚 → Error / Cancelled
 *
 * 完整边集与 Mermaid 图见 docs/agent-architecture.md
 */
import {
  analyzeReachability,
  formatReachabilityIssues,
  hasReachabilityIssues,
  type ReachabilityReport
} from './decision-tree.js'
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

export interface CriticVerdict {
  readonly pass: boolean
  readonly issues: readonly string[]
}

export type CriticReport =
  | { kind: 'deterministic'; reachability: ReachabilityReport }
  | {
      kind: 'llm'
      text: string
      pass?: boolean
      issues?: readonly string[]
      /** true 表示 critic 回复未能解析为 JSON verdict */
      parseError?: boolean
    }

export type AgentStep =
  | { type: 'plan'; plan: AgentPlan }
  | { type: 'plan_progress'; current: number; total: number; description: string }
  | { type: 'thought'; text: string }
  | { type: 'tool_call'; call: ToolCall; risk: ToolRisk; decision: GateDecision }
  | { type: 'awaiting_confirm'; call: ToolCall; risk: ToolRisk; diff?: { before: string; after: string } }
  | { type: 'tool_result'; result: ToolResult }
  | { type: 'critic'; report: CriticReport }
  | { type: 'done'; text: string; warnings?: readonly string[] }
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
  /** run 结束为 done 但 critic 仍发现问题(预算耗尽)时记录,不再静默通过 */
  warnings?: string[]
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
  /** 全项目解析失败清单(格式化文本);非空视为需要修复的问题 */
  loadParseFailures?: () => Promise<string>
  maxSteps?: number
  /** 步数耗尽时的修订重规划次数上限(默认 1);仅 usePlanner 拓扑生效 */
  maxReplan?: number
  /** Critic 发现可达性问题后的修复重试次数上限(默认 1) */
  maxCriticFix?: number
  signal?: AbortSignal
}

const DEFAULT_MAX_STEPS = 30

const DEFAULT_MAX_REPLANS = 1

const DEFAULT_MAX_CRITIC_FIX = 1

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
  '你是质量审查员。基于目标与本轮执行记录(工具调用及结果),审查是否达成、有无遗漏或风险(死路/悬空跳转/叙事断裂)。' +
  '以 JSON 回复: {"pass": true/false, "issues": ["问题1", ...]}。pass 为 true 表示无问题。'

/** 从本轮 steps 提取工具调用与结果摘要,供 LLM critic 审查(不再闭眼) */
const executionDigest = (steps: readonly AgentStep[]): string => {
  const lines: string[] = []
  for (const s of steps) {
    if (s.type === 'tool_call') lines.push(`- 调用 ${s.call.name}`)
    else if (s.type === 'tool_result')
      lines.push(`  → ${s.result.ok ? '成功' : '失败'}: ${s.result.content.slice(0, 200)}`)
  }
  return lines.length > 0 ? lines.join('\n') : '(本轮无工具调用)'
}

const runDeterministicCritic = async (
  deps: AgentLoopDeps,
  emit: (s: AgentStep) => void
): Promise<ReachabilityReport | null> => {
  if (!deps.loadScriptAst) return null
  const ast = await deps.loadScriptAst()
  if (!ast) return null
  const reachability = analyzeReachability(ast)
  emit({ type: 'critic', report: { kind: 'deterministic', reachability } })
  return reachability
}

/** 解析 LLM critic 的 JSON verdict;容忍 markdown 代码围栏与前后缀文本 */
export const parseCriticVerdict = (text: string): CriticVerdict | null => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates = [fenced?.[1], text]
  for (const candidate of candidates) {
    if (!candidate) continue
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start < 0 || end <= start) continue
    try {
      const raw: unknown = JSON.parse(candidate.slice(start, end + 1))
      if (
        typeof raw === 'object' &&
        raw !== null &&
        typeof (raw as { pass?: unknown }).pass === 'boolean'
      ) {
        const obj = raw as { pass: boolean; issues?: unknown }
        const issues = Array.isArray(obj.issues)
          ? obj.issues.filter((i): i is string => typeof i === 'string')
          : []
        return { pass: obj.pass, issues }
      }
    } catch {
      // 尝试下一个候选片段
    }
  }
  return null
}

const runLlmCritic = async (
  req: AgentRunRequest,
  deps: AgentLoopDeps,
  steps: readonly AgentStep[],
  emit: (s: AgentStep) => void,
  chatOpts: { signal?: AbortSignal }
): Promise<CriticVerdict | null> => {
  const criticResp = await deps.llm.chat({
    system: CRITIC_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `目标:${req.goal}\n\n本轮执行记录:\n${executionDigest(steps)}\n\n请基于上述执行记录审查:是否达成目标、有无遗漏或风险。`
      }
    ],
    tools: [],
    ...chatOpts
  })
  const verdict = parseCriticVerdict(criticResp.text)
  emit({
    type: 'critic',
    report: verdict
      ? { kind: 'llm', text: criticResp.text, pass: verdict.pass, issues: verdict.issues }
      : { kind: 'llm', text: criticResp.text, parseError: true }
  })
  return verdict
}

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
    let plan: AgentPlan | null = null
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
      plan = planFromText(planResp.text)
      emit({ type: 'plan', plan })
    }

    // ---- Execute + Critic fix loop ----
    const planConstraint = plan
      ? `\n\n参考执行计划:\n${plan.steps.map((s) => `${s.index}. ${s.description}`).join('\n')}`
      : ''
    const convo: ChatMessage[] = [
      ...(req.messages ?? []),
      { role: 'user', content: req.goal + planConstraint }
    ]
    const toolSchemas = deps.llm.supportsTools ? deps.tools.toJsonSchemas() : []
    let finalText = ''
    const maxReplans = deps.maxReplan ?? DEFAULT_MAX_REPLANS
    let replansLeft = deps.topology.usePlanner ? maxReplans : 0
    const maxCriticFix = deps.maxCriticFix ?? DEFAULT_MAX_CRITIC_FIX
    const criticEnabled = deps.topology.criticKind !== 'none'
    let fixesLeft = criticEnabled ? maxCriticFix : 0
    const runDeterministic =
      deps.topology.criticKind === 'deterministic' || deps.topology.criticKind === 'llm'
    const runLlm = deps.topology.criticKind === 'llm'
    let planCursor = 0

    const planStepHint = (): string => {
      if (!plan || planCursor >= plan.steps.length) return ''
      const stepDef = plan.steps[planCursor]!
      return (
        `\n\n当前计划步骤 ${planCursor + 1}/${plan.steps.length}: ${stepDef.description}` +
        '\n完成当前步骤后,在回复末尾单独一行输出 [STEP_DONE];步骤未完成时不要输出该标记。'
      )
    }

    /** executor 回复中的步骤完成标记;planCursor 据此推进,而非按轮次盲推 */
    const STEP_DONE_MARK = '[STEP_DONE]'

    // Agent state machine — intentionally infinite loop with explicit break/return exits.
    // step 跨 critic-fix 轮累计(共享步数预算);仅重规划时重置。
    let step = 0
    const warnings: string[] = []
    let fixRounds = 0
    while (true) {
      let completed = false

      // ---- Execute stage (ReAct) ----
      while (!completed) {
        ensureLive()
        if (step >= maxSteps) {
          if (replansLeft > 0) {
            replansLeft--
            const replanResp = await deps.llm.chat({
              system: req.system,
              messages: [
                ...convo,
                {
                  role: 'user',
                  content:
                    '已用尽本轮步数但目标尚未完成。请基于已完成的进度,修订一份简短分步计划(编号列表),从下一步继续。'
                }
              ],
              tools: [],
              ...chatOpts
            })
            plan = planFromText(replanResp.text)
            emit({ type: 'plan', plan })
            planCursor = 0
            convo.push({
              role: 'user',
              content: `修订执行计划:\n${plan.steps.map((s) => `${s.index}. ${s.description}`).join('\n')}`
            })
            step = 0
            continue
          }
          break
        }
        step++
        if (plan && planCursor < plan.steps.length) {
          const stepDef = plan.steps[planCursor]!
          emit({
            type: 'plan_progress',
            current: planCursor + 1,
            total: plan.steps.length,
            description: stepDef.description
          })
        }
        const executorSystem = req.system + planStepHint()
        const resp = await deps.llm.chat({
          system: executorSystem,
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

        // 步骤完成标记推进计划游标(完成驱动,非轮次驱动)
        if (plan && planCursor < plan.steps.length && resp.text.includes(STEP_DONE_MARK)) {
          planCursor++
        }

        convo.push({
          role: 'assistant',
          content: resp.text || `(调用工具: ${resp.toolCalls.map((c) => c.name).join(', ')})`
        })

        for (const toolCall of resp.toolCalls) {
          ensureLive()
          const def = deps.tools.get(toolCall.name)
          if (!def) {
            const unknown: ToolResult = {
              id: toolCall.id,
              name: toolCall.name,
              ok: false,
              content: `未知工具 ${toolCall.name}`,
              error: { code: 'UNKNOWN_TOOL', message: `tool not registered: ${toolCall.name}` }
            }
            emit({ type: 'tool_result', result: unknown })
            convo.push({ role: 'user', content: `工具 ${toolCall.name} 结果: ${unknown.content}` })
            continue
          }
          const risk: ToolRisk = def.risk
          const decision = deps.gate.decide(risk)
          emit({ type: 'tool_call', call: toolCall, risk, decision })

          if (decision === 'confirm') {
            const diff = await deps.tools.preview(toolCall, deps.toolContext)
            emit({ type: 'awaiting_confirm', call: toolCall, risk, diff: diff ?? undefined })
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

      if (!completed) {
        if (fixRounds > 0) {
          // 修复轮内步数耗尽:降级为 warning 结束,不回滚已修复内容
          warnings.push('修复轮内步数耗尽,问题可能未完全修复')
          emit({ type: 'done', text: finalText || '修复未完全完成', warnings: [...warnings] })
          return { status: 'done', steps, finalText, warnings: [...warnings] }
        }
        throw new MaxStepsError()
      }
      fixRounds++

      // ---- Critic stage ----
      let needFix = false
      const criticIssues: string[] = []

      if (runDeterministic) {
        const reachability = await runDeterministicCritic(deps, emit)
        if (reachability && hasReachabilityIssues(reachability)) {
          criticIssues.push(`可达性问题:\n${formatReachabilityIssues(reachability)}`)
        }
      }

      if (deps.loadParseFailures) {
        const failuresText = await deps.loadParseFailures()
        if (failuresText) criticIssues.push(`以下剧本解析失败:\n${failuresText}`)
      }

      if (runLlm) {
        const verdict = await runLlmCritic(req, deps, steps, emit, chatOpts)
        if (verdict && !verdict.pass) {
          criticIssues.push(
            verdict.issues.length > 0
              ? `LLM 审查未通过:\n- ${verdict.issues.join('\n- ')}`
              : 'LLM 审查未通过(未给出具体问题)'
          )
        }
      }

      if (criticIssues.length > 0) {
        if (fixesLeft > 0) {
          needFix = true
          convo.push({
            role: 'user',
            content: `审查发现问题,请修复:\n${criticIssues.join('\n\n')}\n修复后继续,不要重复已完成的工作。`
          })
        } else {
          warnings.push(`审查发现问题但修复预算已耗尽:\n${criticIssues.join('\n\n')}`)
        }
      }

      if (!needFix) break
      fixesLeft--
      // fix 重入继续消耗同一份步数预算(step 不重置)
    }

    emit({ type: 'done', text: finalText, warnings: warnings.length > 0 ? warnings : undefined })
    return {
      status: 'done',
      steps,
      finalText,
      warnings: warnings.length > 0 ? warnings : undefined
    }
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
