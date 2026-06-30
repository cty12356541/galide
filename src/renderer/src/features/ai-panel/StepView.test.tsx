import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { StepView } from './AgentModePanel.js'
import type { AgentStep } from '../../lib/ipc/use-agent'

describe('StepView — critic / awaiting_confirm 渲染', () => {
  it('critic deterministic 显示可达性摘要', () => {
    const step = {
      type: 'critic',
      report: {
        kind: 'deterministic',
        reachability: {
          entry: 's1',
          reachable: ['s1'],
          unreachable: ['s2'],
          danglingTargets: [{ from: 's1', target: 's3' }]
        }
      }
    } as AgentStep
    const { container } = render(<StepView step={step} />)
    const text = container.textContent ?? ''
    expect(text).toContain('审查 · 可达性')
    expect(text).toContain('s2')
    expect(text).toContain('s1→s3')
  })

  it('critic llm 显示审查文本', () => {
    const step = {
      type: 'critic',
      report: { kind: 'llm', text: '已达成目标,无遗漏' }
    } as AgentStep
    const { container } = render(<StepView step={step} />)
    const text = container.textContent ?? ''
    expect(text).toContain('审查')
    expect(text).toContain('已达成目标,无遗漏')
  })

  it('awaiting_confirm 显示等待确认', () => {
    const step = {
      type: 'awaiting_confirm',
      call: { id: '1', name: 'add_dialogue', args: {} }
    } as AgentStep
    const { container } = render(<StepView step={step} />)
    const text = container.textContent ?? ''
    expect(text).toContain('等待确认')
    expect(text).toContain('add_dialogue')
  })
})
