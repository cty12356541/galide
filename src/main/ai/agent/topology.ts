/**
 * topology — 可切换循环拓扑(可组合 stage 的配置)
 *
 * 三档共用同一套 stage(Planner / Executor / Critic),仅编排不同:
 *   - singleReact      — 仅 Executor(ReAct),最轻
 *   - litePlanExecute  — Planner → Executor → 确定性可达性 Critic(默认)
 *   - planExecuteCritic— Planner → Executor → LLM Critic(最强)
 */

export type AgentTopology = 'singleReact' | 'litePlanExecute' | 'planExecuteCritic'

export type CriticKind = 'none' | 'deterministic' | 'llm'

export interface Topology {
  id: AgentTopology
  usePlanner: boolean
  criticKind: CriticKind
}

export const TOPOLOGIES: Record<AgentTopology, Topology> = {
  singleReact: { id: 'singleReact', usePlanner: false, criticKind: 'none' },
  litePlanExecute: { id: 'litePlanExecute', usePlanner: true, criticKind: 'deterministic' },
  planExecuteCritic: { id: 'planExecuteCritic', usePlanner: true, criticKind: 'llm' }
}

export const DEFAULT_TOPOLOGY: AgentTopology = 'litePlanExecute'

export interface PlanStep {
  index: number
  description: string
}

export interface AgentPlan {
  steps: PlanStep[]
  /** Planner LLM 原文(供 UI 展示 / 编辑回退) */
  raw: string
}

const NUMBERED = /^\s*(\d+)[.)]\s*(.+)$/
const BULLET = /^\s*[-*]\s*(.+)$/

/**
 * 把 Planner 文本解析为结构化、可编辑的计划。
 * 优先识别编号 / 无序列表;无可识别条目时整段作为单步。
 */
export const planFromText = (text: string): AgentPlan => {
  const steps: PlanStep[] = []
  const lines = text.split('\n')
  for (const line of lines) {
    const numbered = NUMBERED.exec(line)
    if (numbered) {
      steps.push({ index: steps.length + 1, description: numbered[2]!.trim() })
      continue
    }
    const bullet = BULLET.exec(line)
    if (bullet) {
      steps.push({ index: steps.length + 1, description: bullet[1]!.trim() })
    }
  }
  if (steps.length === 0) {
    const trimmed = text.trim()
    if (trimmed) steps.push({ index: 1, description: trimmed })
  }
  return { steps, raw: text }
}
