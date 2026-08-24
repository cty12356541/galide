/**
 * BrainPanel 组件测试 — 三类知识渲染 / 空态 / 损坏提示
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { BrainPanel } from './BrainPanel'
import type { ProjectBrain } from '../../../../shared/brain/schema'

const brain: ProjectBrain = {
  version: '0.1.0',
  foreshadowings: [
    {
      id: 'f1',
      description: '怀表停在三点',
      plantedInSceneId: 'start',
      plantedInFile: 'main.gal',
      status: 'planted',
      updatedAt: 't'
    }
  ],
  relationships: [
    {
      id: 'rel-1',
      characterA: '小雪',
      characterB: '阳',
      description: '青梅竹马',
      stages: [{ note: '相遇' }, { note: '互信' }],
      updatedAt: 't'
    }
  ],
  knowledgeBoundaries: [
    { id: 'k1', condition: 'route_haru', fact: '小雪的过去', known: false, updatedAt: 't' }
  ]
}

vi.mock('../../lib/store', () => ({
  useUiStore: (sel: (s: { projectPath: string | null; projectName: string | null }) => unknown) =>
    sel({ projectPath: '/proj', projectName: 'demo' })
}))

const listMock = vi.fn()

vi.mock('../../lib/ipc/use-brain', () => ({
  useBrain: () => ({ list: (...a: unknown[]) => listMock(...a) })
}))

describe('BrainPanel', () => {
  beforeEach(() => {
    listMock.mockReset()
  })

  it('渲染三类知识', async () => {
    listMock.mockResolvedValue({ ok: true, brain })
    const { container } = render(<BrainPanel />)
    await vi.waitFor(() => {
      const text = container.textContent ?? ''
      expect(text).toContain('怀表停在三点')
    })
    const text = container.textContent ?? ''
    expect(text).toContain('未回收')
    expect(text).toContain('小雪 × 阳')
    expect(text).toContain('相遇 → 互信')
    expect(text).toContain('route_haru')
    expect(text).toContain('未知')
  })

  it('空 brain 显示空态', async () => {
    listMock.mockResolvedValue({
      ok: true,
      brain: { version: '0.1.0', foreshadowings: [], relationships: [], knowledgeBoundaries: [] }
    })
    const { container } = render(<BrainPanel />)
    await vi.waitFor(() => {
      expect(container.textContent ?? '').toContain('项目大脑为空')
    })
  })

  it('invalid 标记显示损坏提示', async () => {
    listMock.mockResolvedValue({
      ok: true,
      brain: { version: '0.1.0', foreshadowings: [], relationships: [], knowledgeBoundaries: [] },
      invalid: true
    })
    const { container } = render(<BrainPanel />)
    await vi.waitFor(() => {
      expect(container.textContent ?? '').toContain('无法解析')
    })
  })
})
