/**
 * topology-dag — Agent 编排拓扑的有向图模型(DAG + 有预算回边)
 *
 * 与 agent-loop 实现对齐,但用 fan-in / fan-out 表达阶段依赖,而非单链 A→B→C。
 * 「回边」(replan / critic-fix) 标注为 retry,运行时消耗 maxReplan / maxCriticFix 预算。
 */
import type { AgentTopology, Topology } from './topology.js'
import { TOPOLOGIES } from './topology.js'

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

/**
 * Agent 编排 DAG(静态边集)。
 * - forward: 正常推进
 * - retry: 有预算的回边(replan / critic-fix),运行时非无限循环
 */
export const AGENT_STAGE_EDGES: readonly StageEdge[] = [
  // --- 输入 fan-in ---
  { from: 'context', to: 'plan', kind: 'forward', label: 'usePlanner' },
  { from: 'context', to: 'execute', kind: 'forward' },
  { from: 'snapshot', to: 'plan', kind: 'forward', label: 'usePlanner' },
  { from: 'snapshot', to: 'execute', kind: 'forward' },
  { from: 'plan', to: 'execute', kind: 'forward' },

  // --- Executor ↔ Tools (fan-out / fan-in) ---
  { from: 'execute', to: 'gate', kind: 'forward', label: 'tool_calls' },
  { from: 'gate', to: 'confirm', kind: 'forward', label: 'decision=confirm' },
  { from: 'gate', to: 'tools', kind: 'forward', label: 'decision=allow' },
  { from: 'confirm', to: 'tools', kind: 'forward', label: 'approved' },
  { from: 'tools', to: 'execute', kind: 'forward', label: 'observation' },

  // --- 步数耗尽 → 重规划(retry) ---
  { from: 'execute', to: 'replan', kind: 'forward', label: 'maxSteps' },
  { from: 'replan', to: 'execute', kind: 'retry', label: 'maxReplan' },

  // --- 审查 fan-out → 汇聚 done ---
  { from: 'execute', to: 'critic_det', kind: 'forward', label: 'completed' },
  { from: 'execute', to: 'critic_llm', kind: 'forward', label: 'criticKind=llm' },
  { from: 'critic_det', to: 'execute', kind: 'retry', label: 'reachability issues + maxCriticFix' },
  { from: 'critic_det', to: 'done', kind: 'forward', label: 'pass or budget exhausted' },
  { from: 'critic_llm', to: 'done', kind: 'forward' },

  // --- 失败路径 ---
  { from: 'execute', to: 'error', kind: 'forward', label: 'cancel / maxSteps' },
  { from: 'snapshot', to: 'error', kind: 'forward', label: 'snapshot failed' }
]

/** 规约 / 文档用 Mermaid(flowchart TB,DAG 布局) */
export const AGENT_TOPOLOGY_DAG_MERMAID = `flowchart TB
  subgraph inputs [Inputs]
    Goal[Goal]
    Context[ContextEngine]
    Memory[AgentMemory]
  end

  subgraph prep [Prep]
    Snapshot[GitSnapshot]
  end

  subgraph orchestration [Orchestration]
    Planner[Planner]
    Executor[ReActExecutor]
    Replan[Replan]
  end

  subgraph tools [ToolFanOut]
    Gate[AutonomyGate]
    Confirm[UserConfirm]
    ToolRegistry[ToolRegistry]
  end

  subgraph review [Review]
    CriticDet[DeterministicCritic]
    CriticLlm[LLMCritic]
    Done[Done]
    Error[Error]
  end

  Goal --> Planner
  Goal --> Executor
  Context --> Planner
  Context --> Executor
  Memory --> Context
  Snapshot --> Planner
  Snapshot --> Executor
  Planner --> Executor

  Executor --> Gate
  Gate -->|allow| ToolRegistry
  Gate -->|confirm| Confirm
  Confirm --> ToolRegistry
  ToolRegistry -->|observation| Executor

  Executor -->|maxSteps| Replan
  Replan -->|maxReplan retry| Executor

  Executor -->|completed| CriticDet
  Executor -->|planExecuteCritic| CriticLlm
  CriticDet -->|issues + maxCriticFix retry| Executor
  CriticDet --> Done
  CriticLlm --> Done

  Executor --> Error
  Snapshot --> Error`

/** 给定拓扑启用的 stage 子集(不含纯输入节点 goal/memory) */
export const activeStagesFor = (topology: Topology): readonly AgentStageId[] => {
  const stages: AgentStageId[] = ['snapshot', 'context', 'execute', 'gate', 'confirm', 'tools', 'done', 'error']
  if (topology.usePlanner) stages.push('plan', 'replan')
  if (topology.criticKind === 'deterministic' || topology.criticKind === 'llm') {
    stages.push('critic_det')
  }
  if (topology.criticKind === 'llm') stages.push('critic_llm')
  return stages
}

/** 给定拓扑的有效 forward 边(过滤未启用 stage) */
export const forwardEdgesFor = (topology: Topology): readonly StageEdge[] => {
  const active = new Set(activeStagesFor(topology))
  return AGENT_STAGE_EDGES.filter(
    (e) => e.kind === 'forward' && active.has(e.from) && active.has(e.to)
  )
}

/** 给定拓扑的有效 retry 边(含预算语义) */
export const retryEdgesFor = (topology: Topology): readonly StageEdge[] => {
  const active = new Set(activeStagesFor(topology))
  return AGENT_STAGE_EDGES.filter(
    (e) => e.kind === 'retry' && active.has(e.from) && active.has(e.to)
  )
}

/** 拓扑 id → Topology 配置 */
export const topologyFor = (id: AgentTopology): Topology => TOPOLOGIES[id]

// ----------------------------------------------------------------------------
// 演示例子 — 用 DAG 路径描述(非单链 A→B→C)
// ----------------------------------------------------------------------------

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

/**
 * 演示: 可达性问题 → critic-fix retry 边(非单链重跑)
 *   Execute → CriticDet ──retry(maxCriticFix)──► Execute → CriticDet → Done
 */
export const EXAMPLE_CRITIC_FIX_RETRY: AgentDagExample = {
  id: 'critic_fix_retry',
  goal: '修复决策树死路',
  topology: 'litePlanExecute',
  walk: [
    { stage: 'snapshot' },
    { stage: 'context' },
    { stage: 'plan', via: { from: 'context', to: 'plan', kind: 'forward' } },
    { stage: 'execute', via: { from: 'plan', to: 'execute', kind: 'forward' } },
    { stage: 'critic_det', via: { from: 'execute', to: 'critic_det', kind: 'forward', label: 'completed' } },
    {
      stage: 'execute',
      via: {
        from: 'critic_det',
        to: 'execute',
        kind: 'retry',
        label: 'reachability issues + maxCriticFix'
      },
      note: '注入修复指令,非从新 Plan 开始'
    },
    { stage: 'critic_det', via: { from: 'execute', to: 'critic_det', kind: 'forward' } },
    { stage: 'done', via: { from: 'critic_det', to: 'done', kind: 'forward' } }
  ],
  mermaid: `flowchart TB
  Exec1[Executor pass1]
  CDet1[CriticDet: unreachable]
  Exec2[Executor pass2 fix]
  CDet2[CriticDet: pass]
  Done[Done]

  Exec1 -->|completed| CDet1
  CDet1 -->|retry maxCriticFix| Exec2
  Exec2 -->|completed| CDet2
  CDet2 --> Done`
}

/** AgentStep 类型 → DAG stage 提示(用于校验演示 run 是否沿预期路径) */
export const stageHintsFromAgentStep = (step: {
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
    for (const stage of stageHintsFromAgentStep(step)) {
      if (out[out.length - 1] !== stage) out.push(stage)
    }
  }
  return out
}

/** 演示例子 walk 中的 stage 序(跳过无边首节点 snapshot/context) */
export const walkStages = (example: AgentDagExample): AgentStageId[] =>
  example.walk.map((h) => h.stage).filter((s) => s !== 'snapshot' && s !== 'context')

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
  if (example.id === 'critic_fix_retry') {
    return visited.has('plan') && visited.has('critic_det') && visited.has('done')
  }
  return walkStages(example).every((s) => visited.has(s))
}
