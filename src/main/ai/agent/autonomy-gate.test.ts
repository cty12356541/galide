/**
 * autonomy-gate 单测 — risk × mode 真值表(全 9 组合)
 *
 * 设计:gate 是唯一感知 mode 的地方(循环主体不随 mode 变)。
 *   read       → 任何模式都放行
 *   safeWrite  → copilot 暂停确认;hybrid/autonomous 放行
 *   destructive→ copilot/hybrid 暂停确认;autonomous 放行
 */
import { describe, it, expect } from 'vitest'
import { gateDecision, createAutonomyGate, type AutonomyMode } from './autonomy-gate.js'
import type { ToolRisk } from './types.js'

type Row = { risk: ToolRisk; mode: AutonomyMode; expect: 'allow' | 'confirm' }

const table: Row[] = [
  { risk: 'read', mode: 'copilot', expect: 'allow' },
  { risk: 'read', mode: 'hybrid', expect: 'allow' },
  { risk: 'read', mode: 'autonomous', expect: 'allow' },
  { risk: 'safeWrite', mode: 'copilot', expect: 'confirm' },
  { risk: 'safeWrite', mode: 'hybrid', expect: 'allow' },
  { risk: 'safeWrite', mode: 'autonomous', expect: 'allow' },
  { risk: 'destructive', mode: 'copilot', expect: 'confirm' },
  { risk: 'destructive', mode: 'hybrid', expect: 'confirm' },
  { risk: 'destructive', mode: 'autonomous', expect: 'allow' }
]

describe('autonomy-gate 真值表', () => {
  for (const row of table) {
    it(`risk=${row.risk} × mode=${row.mode} → ${row.expect}`, () => {
      expect(gateDecision(row.risk, row.mode)).toBe(row.expect)
    })
  }

  it('createAutonomyGate 绑定 mode,decide(risk) 同真值表', () => {
    const gate = createAutonomyGate('hybrid')
    expect(gate.mode).toBe('hybrid')
    expect(gate.decide('safeWrite')).toBe('allow')
    expect(gate.decide('destructive')).toBe('confirm')
  })
})
