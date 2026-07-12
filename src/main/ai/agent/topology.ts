/**
 * topology — 可切换循环拓扑(可组合 stage 的配置)
 *
 * 三档共用同一套 stage(Planner / Executor / Critic),编排为 DAG 而非单链:
 *   - 输入 fan-in: Context + Goal → Planner / Executor
 *   - 工具 fan-out: Executor → Gate → ToolRegistry → observation → Executor
 *   - 审查 fan-out: Executor → Critic(det/llm) → Done;有问题时 retry → Executor
 *   - 步数耗尽: Executor → Replan(retry) → Executor
 *
 * 完整边集与 Mermaid 图见 docs/agent-architecture.md。
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

// ----------------------------------------------------------------------------
// DAG stage helpers (kept for tests & docs)
// ----------------------------------------------------------------------------

/** 编排阶段节点 */
export type AgentStageId =
  | 'snapshot'
  | 'context'
  | 'plan'
  | 'execute'
  | 'gate'
  | 'confirm'
  | 'tools'
  | 'replan'
  | 'critic_det'
  | 'critic_llm'
  | 'done'
  | 'error'

export type StageEdgeKind = 'forward' | 'retry'

export interface StageEdge {
  from: AgentStageId
  to: AgentStageId
  kind: StageEdgeKind
  /** 人类可读触发条件(文档 / UI) */
  label?: string
}

/** 一次 agent run 在 DAG 上经过的阶段(可与 AgentStep 映射) */
export interface DagWalkHop {
  stage: AgentStageId
  /** 进入该 stage 所沿的边(首节点可为 snapshot/context,无边) */
  via?: StageEdge
  note?: string
}

export interface AgentDagExample {
  id: string
  goal: string
  topology: AgentTopology
  /**  happy path 沿 DAG 走过的阶段序(含 fan-out 各支) */
  walk: readonly DagWalkHop[]
  mermaid: string
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

export const stagesFromAgentStep = (step: {
  type: string
  report?: { kind?: string }
}): readonly AgentStageId[] => {
  switch (step.type) {
    case 'plan':
      return ['plan']
    case 'plan_progress':
    case 'thought':
      return ['execute']
    case 'tool_call':
      return ['gate', 'tools']
    case 'awaiting_confirm':
      return ['confirm', 'tools']
    case 'tool_result':
      return ['tools', 'execute']
    case 'critic':
      return [step.report?.kind === 'llm' ? 'critic_llm' : 'critic_det']
    case 'done':
      return ['done']
    case 'error':
      return ['error']
    default:
      return []
  }
}

/** 从 AgentStep[] 提取 stage 访问序(合并连续重复) */
export const stagesFromAgentSteps = (
  steps: readonly { type: string; report?: { kind?: string } }[]
): AgentStageId[] => {
  const out: AgentStageId[] = []
  for (const step of steps) {
    for (const stage of stagesFromAgentStep(step)) {
      if (out[out.length - 1] !== stage) out.push(stage)
    }
  }
  return out
}

/** 演示例子 walk 中的 stage 序(跳过无边首节点 snapshot/context) */
export const walkStages = (example: AgentDagExample): AgentStageId[] =>
  example.walk.map((h) => h.stage).filter((s) => s !== 'snapshot' && s !== 'context')

/**
 * 演示: goal「给小雪加一句对白」@ planExecuteCritic + autonomous
 *
 * 不是 Plan→Exec→Critic 单链,而是:
 *   fan-in(Goal+Context→Plan, Plan→Execute)
 *   → Execute↔Tools 环(add_dialogue)
 *   → fan-out(Execute→CriticDet ∥ CriticLlm)
 *   → fan-in→Done
 */
export const EXAMPLE_ADD_DIALOGUE: AgentDagExample = {
  id: 'add_dialogue',
  goal: '给小雪加一句对白',
  topology: 'planExecuteCritic',
  walk: [
    { stage: 'snapshot', note: 'git snapshot(回滚点)' },
    { stage: 'context', note: 'context-engine fan-in 角色/场景/对白摘要' },
    { stage: 'plan', via: { from: 'context', to: 'plan', kind: 'forward', label: 'usePlanner' } },
    {
      stage: 'execute',
      via: { from: 'plan', to: 'execute', kind: 'forward' },
      note: 'ReAct:计划步进 + LLM 决策'
    },
    {
      stage: 'gate',
      via: { from: 'execute', to: 'gate', kind: 'forward', label: 'tool_calls' },
      note: 'add_dialogue risk=safeWrite'
    },
    {
      stage: 'tools',
      via: { from: 'gate', to: 'tools', kind: 'forward', label: 'decision=allow' },
      note: 'autonomous:跳过 confirm'
    },
    {
      stage: 'execute',
      via: { from: 'tools', to: 'execute', kind: 'forward', label: 'observation' },
      note: '工具结果回灌'
    },
    {
      stage: 'execute',
      note: 'ReAct:无 tool_calls → completed'
    },
    {
      stage: 'critic_det',
      via: { from: 'execute', to: 'critic_det', kind: 'forward', label: 'completed' },
      note: 'analyzeReachability(AST)'
    },
    {
      stage: 'critic_llm',
      via: { from: 'execute', to: 'critic_llm', kind: 'forward', label: 'criticKind=llm' },
      note: 'executionDigest 审查'
    },
    {
      stage: 'done',
      via: { from: 'critic_llm', to: 'done', kind: 'forward' },
      note: '双轨审查汇聚'
    }
  ],
  mermaid: `flowchart TB
  Goal[Goal: 给小雪加一句对白]
  Context[ContextEngine]
  Plan[Planner]
  Exec[ReActExecutor]
  Gate[AutonomyGate]
  Tools[ToolRegistry add_dialogue]
  CDet[DeterministicCritic]
  CLlm[LLMCritic]
  Done[Done]

  Goal --> Plan
  Goal --> Exec
  Context --> Plan
  Context --> Exec
  Plan --> Exec
  Exec --> Gate
  Gate -->|allow safeWrite| Tools
  Tools -->|observation| Exec
  Exec -->|completed fan-out| CDet
  Exec -->|completed fan-out| CLlm
  CDet --> Done
  CLlm --> Done`
}

/** 校验 run 的 steps 是否覆盖演示例子的关键 DAG stage */
export const stepsCoverExampleWalk = (
  steps: readonly { type: string; report?: { kind?: string } }[],
  example: AgentDagExample
): boolean => {
  const visited = new Set(stagesFromAgentSteps(steps))
  if (example.id === 'add_dialogue') {
    return ['plan', 'gate', 'tools', 'critic_det', 'critic_llm', 'done'].every((s) =>
      visited.has(s as AgentStageId)
    )
  }
  return walkStages(example).every((s) => visited.has(s))
}
