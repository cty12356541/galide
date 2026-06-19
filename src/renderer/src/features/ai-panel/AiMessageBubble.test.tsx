import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TypewriterText } from './AiMessageBubble.js'

/**
 * AiMessageBubble — 流式逐字 + 结束后 Markdown 渲染
 *
 * 覆盖:
 *   - 闭合 think 默认折叠,折叠态零内容 DOM
 *   - 手动点击 chip toggle
 *   - 未闭合 think 流式 → chip 自动展开;闭合/流结束 → 自动折叠
 *   - 流式期正文逐字(stretch),结束 streaming=false → Markdown 渲染(结构生效)
 *   - 正文 Markdown:加粗/列表被正确解析(非字面量)
 *   - 长行(>50 字)正文无 React key 警告
 */

describe('AiMessageBubble — think 折叠 chip', () => {
  it('闭合 think 默认折叠,正文显示,think 内容不进 DOM', () => {
    const { container } = render(
      <TypewriterText text="<think>秘密思考</think>正文内容" streaming={false} />
    )
    // streaming=false → 正文走 Markdown 渲染
    expect(container.textContent).toContain('正文内容')
    expect(container.textContent).not.toContain('秘密思考')
    const chip = screen.getByTestId('think-chip-0')
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    expect(chip.textContent).toContain('已思考')
  })

  it('点击 chip 展开 → think 显示;再点 → 折叠', () => {
    const { container } = render(
      <TypewriterText text="<think>秘密思考</think>正文" streaming={false} />
    )
    expect(container.textContent).not.toContain('秘密思考')
    const chip = screen.getByTestId('think-chip-0')
    fireEvent.click(chip)
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
    rerender(<TypewriterText text="<think>思考中</think>正文" streaming={false} />)
    chip = screen.getByTestId('think-chip-0')
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    expect(chip.textContent).toContain('已思考')
  })
})

describe('AiMessageBubble — 正文 Markdown 渲染', () => {
  it('streaming=false 时渲染 Markdown:加粗/列表为结构而非字面量', () => {
    const { container } = render(
      <TypewriterText
        text={`**重要**

- 项一
- 项二`}
        streaming={false}
      />
    )
    // 加粗 → <strong>,不再是字面 "**"
    expect(container.querySelector('strong')?.textContent).toBe('重要')
    expect(container.textContent).not.toContain('**重要**')
    // 列表 → <li>
    const items = container.querySelectorAll('li')
    expect(items.length).toBe(2)
    expect(items[0].textContent).toBe('项一')
  })

  it('streaming=true 时正文逐字出现(非一次性)', () => {
    let now = 0
    let nextId = 1
    const pending = new Map<number, () => void>()
    vi.stubGlobal('performance', { now: () => now })
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void): number => {
      const id = nextId++
      pending.set(id, () => cb(now))
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
      pending.delete(id)
    })
    try {
      const { container } = render(<TypewriterText text="abcdef" streaming={true} />)
      // 流式逐字:tick 推进几格,只出现部分
      expect(container.textContent).not.toContain('abcdef')
      const flush = (): void => {
        act(() => {
          for (const id of [...pending.keys()]) {
            const fn = pending.get(id)
            pending.delete(id)
            fn?.()
          }
        })
      }
      now += 45
      flush()
      // 至少出现一部分但非全部
      expect(container.textContent!.length).toBeGreaterThan(0)
      expect(container.textContent).not.toContain('abcdef')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('AiMessageBubble — 长行 key 唯一', () => {
  it('长行(>50 字)流式正文无 React key 警告', () => {
    let now = 0
    let nextId = 1
    const pending = new Map<number, () => void>()
    vi.stubGlobal('performance', { now: () => now })
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void): number => {
      const id = nextId++
      pending.set(id, () => cb(now))
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
      pending.delete(id)
    })
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '))
    })
    try {
      const longLine = 'a'.repeat(120)
      const { container } = render(<TypewriterText text={longLine} streaming={true} />)
      // 推进足够 tick 让所有字符 reveal(逐字,span 逐个生成)
      const flush = (): void => {
        act(() => {
          for (const id of [...pending.keys()]) {
            const fn = pending.get(id)
            pending.delete(id)
            fn?.()
          }
        })
      }
      for (let i = 0; i < 140; i++) {
        now += 45
        flush()
      }
      expect(container.textContent).toContain(longLine)
      expect(errors.some((e) => e.includes('key'))).toBe(false)
    } finally {
      spy.mockRestore()
      vi.unstubAllGlobals()
    }
  })
})
