/**
 * topology — 可切换循环拓扑(可组合 stage 的配置)
 *
 * 三档共用同一套 stage(Planner / Executor / Critic),编排为 DAG 而非单链:
 *   - 输入 fan-in: Context + Goal → Planner / Executor
 *   - 工具 fan-out: Executor → Gate → ToolRegistry → observation → Executor
 *   - 审查 fan-out: Executor → Critic(det/llm) → Done;有问题时 retry → Executor
 *   - 步数耗尽: Executor → Replan(retry) → Executor
 *
 * 完整边集见 topology-dag.ts (AGENT_STAGE_EDGES / AGENT_TOPOLOGY_DAG_MERMAID)
 *
 * 三档预设(DAG 子图,非单链命名):
 *   - singleReact      — Execute ↔ Tools 环 + Done
 *   - litePlanExecute  — fan-in(Plan) + Execute↔Tools + CriticDet → Done
 *   - planExecuteCritic— 同上 + 双轨 CriticDet ∥ CriticLlm → Done
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
