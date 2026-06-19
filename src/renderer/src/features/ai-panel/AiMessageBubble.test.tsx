import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TypewriterText } from './AiMessageBubble.js'

/**
 * AiMessageBubble — think/正文 显示顺序重做后的逻辑测试
 *
 * 覆盖:
 *   - 闭合 think 默认折叠(且 </think> 笔误修复后不再误展开)
 *   - 折叠态零内容 DOM(lazy,不渲染 TypewriterSegment)
 *   - 正文独立预算:think 不消耗正文打字机预算(流式下正文不被 think 拖累)
 *   - 未闭合 think 流式 → chip 自动展开;闭合/流结束 → 自动折叠
 *   - 手动点击 chip toggle 展开/折叠
 *   - 长行(>50 字)正文无 React key 警告
 */

describe('AiMessageBubble — think 折叠 chip', () => {
  it('闭合 think 默认折叠,正文完整显示,think 内容不进 DOM', () => {
    const { container } = render(
      <TypewriterText text="<think>秘密思考</think>正文内容" streaming={false} />
    )
    // 正文段 streaming=false → 一次性 reveal
    expect(container.textContent).toContain('正文内容')
    // 折叠态 lazy → think 内容不渲染
    expect(container.textContent).not.toContain('秘密思考')
    // chip 标签为"已思考"
    const chip = screen.getByTestId('think-chip-0')
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    expect(chip.textContent).toContain('已思考')
  })

  it('点击 chip 展开 → think 内容显示;再点 → 折叠', () => {
    const { container } = render(
      <TypewriterText text="<think>秘密思考</think>正文" streaming={false} />
    )
    expect(container.textContent).not.toContain('秘密思考')

    const chip = screen.getByTestId('think-chip-0')
    fireEvent.click(chip)
    // 展开 + streaming=false(已闭合段)→ 一次性 reveal
    expect(chip.getAttribute('aria-expanded')).toBe('true')
    expect(container.textContent).toContain('秘密思考')

    fireEvent.click(chip)
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    expect(container.textContent).not.toContain('秘密思考')
  })

  it('未闭合 think 流式 → chip 自动展开;闭合后 → 自动折叠', () => {
    const { rerender } = render(<TypewriterText text="<think>思考中" streaming={true} />)
    let chip = screen.getByTestId('think-chip-0')
    expect(chip.getAttribute('aria-expanded')).toBe('true')
    expect(chip.textContent).toContain('思考中')

    // 流结束 + think 闭合 + 正文到达
    rerender(<TypewriterText text="<think>思考中</think>正文" streaming={false} />)
    chip = screen.getByTestId('think-chip-0')
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    expect(chip.textContent).toContain('已思考')
  })
})

describe('AiMessageBubble — 正文预算独立', () => {
  let now = 0
  let nextId = 1
  const pending = new Map<number, () => void>()

  beforeEach(() => {
    now = 0
    nextId = 1
    pending.clear()
    vi.stubGlobal('performance', { now: () => now })
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void): number => {
      const id = nextId++
      pending.set(id, () => cb(now))
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
      pending.delete(id)
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  const flush = (): void => {
    act(() => {
      for (const id of [...pending.keys()]) {
        const fn = pending.get(id)
        pending.delete(id)
        fn?.()
      }
    })
  }
  const tick = (ms = 45): void => {
    now += ms
    flush()
  }

  it('think 折叠时不消耗正文打字机预算 — 正文及时出现', () => {
    // 闭合的 100 字 think + 正文;旧版共享预算下正文需等 think 跑完 100 字
    const think = 'a'.repeat(100)
    const { container } = render(
      <TypewriterText text={`<think>${think}</think>正文`} streaming={true} />
    )
    // think 闭合且后跟正文 → 折叠,不渲染 TypewriterSegment → 不占预算
    expect(container.textContent).not.toContain('正文')
    // 正文段独立预算:2 tick 即可出现(think 不抢占)
    for (let i = 0; i < 12; i++) tick()
    expect(container.textContent).toContain('正文')
  })
})

describe('AiMessageBubble — 长行 key 唯一', () => {
  it('长行(>50 字)正文无 React key 警告且完整显示', () => {
    const longLine = 'a'.repeat(120)
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '))
    })

    const { container } = render(<TypewriterText text={longLine} streaming={false} />)
    expect(container.textContent).toContain(longLine)
    // renderChars 用跨行累计 globalIdx,长行不再与"下一行 *50"碰撞
    expect(errors.some((e) => e.includes('key'))).toBe(false)

    spy.mockRestore()
  })
})
