/**
 * PreviewBacklogPanel 组件测试
 */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { PreviewBacklogPanel } from './PreviewBacklogPanel'

describe('PreviewBacklogPanel', () => {
  it('渲染条目与数量,空态提示', () => {
    const { container, rerender } = render(
      <PreviewBacklogPanel entries={[{ sceneId: 's1', character: '小雪', text: '你好' }]} onClose={() => {}} />
    )
    expect(container.textContent).toContain('回看日志(1)')
    expect(container.textContent).toContain('小雪')
    expect(container.textContent).toContain('你好')
    rerender(<PreviewBacklogPanel entries={[]} onClose={() => {}} />)
    expect(container.textContent).toContain('还没有播放过的对白')
  })

  it('关闭按钮触发 onClose', () => {
    const onClose = vi.fn()
    const { container } = render(
      <PreviewBacklogPanel entries={[]} onClose={onClose} />
    )
    fireEvent.click(container.querySelector('[data-testid="preview-backlog-close"]')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
