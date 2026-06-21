/**
 * autonomy-gate — risk × mode 拦截器中间件
 *
 * 把「是否暂停确认」的决策收敛到一处真值表,agent-loop 主体只调用 gate.decide(risk),
 * 不感知具体 mode —— 保证「切换自主模式不改循环主体」(plan 硬约束)。
 *
 * 真值表见 autonomy-gate.test.ts。
 */
import type { ToolRisk } from './types.js'

export type AutonomyMode = 'copilot' | 'hybrid' | 'autonomous'

export type GateDecision = 'allow' | 'confirm'

/** risk × mode → 放行 / 暂停确认 */
export const gateDecision = (risk: ToolRisk, mode: AutonomyMode): GateDecision => {
  if (risk === 'read') return 'allow'
  if (mode === 'autonomous') return 'allow'
  if (risk === 'safeWrite') return mode === 'copilot' ? 'confirm' : 'allow'
  // destructive:copilot / hybrid 都需确认
  return 'confirm'
}

export interface AutonomyGate {
  mode: AutonomyMode
  decide: (risk: ToolRisk) => GateDecision
}

export const createAutonomyGate = (mode: AutonomyMode): AutonomyGate => ({
  mode,
  decide: (risk) => gateDecision(risk, mode)
})

export const DEFAULT_AUTONOMY_MODE: AutonomyMode = 'hybrid'
