/**
 * Skeleton / PanelSkeleton / FormSkeleton 组件测试
 *
 * 覆盖:data-testid 锚点、aria-busy 加载语义、行数可控、className 合并。
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Skeleton, PanelSkeleton, FormSkeleton } from './skeleton'

describe('Skeleton', () => {
  it('渲染占位块,带 data-testid 与 pulse 动画', () => {
    render(<Skeleton />)
    const el = screen.getByTestId('skeleton')
    expect(el.className).toContain('animate-pulse')
    expect(el.className).toContain('bg-bg-elevated')
  })

  it('合并自定义 className,data-testid 可被覆盖', () => {
    render(<Skeleton className="h-6 w-1/3" data-testid="custom-skeleton" />)
    const el = screen.getByTestId('custom-skeleton')
    expect(el.className).toContain('h-6')
    expect(el.className).toContain('animate-pulse')
  })
})

describe('PanelSkeleton', () => {
  it('aria-busy 容器 + header 条 + 指定行数', () => {
    const { container } = render(<PanelSkeleton lines={6} />)
    const busy = container.querySelector('[aria-busy="true"]')
    expect(busy).toBeTruthy()
    expect(busy?.getAttribute('aria-label')).toBe('加载中')
    // 1 header + 6 lines
    expect(screen.getAllByTestId('skeleton')).toHaveLength(7)
  })

  it('默认 4 行', () => {
    render(<PanelSkeleton />)
    expect(screen.getAllByTestId('skeleton')).toHaveLength(5)
  })
})

describe('FormSkeleton', () => {
  it('aria-busy 容器 + 标题区 + 指定 label/control 行数', () => {
    const { container } = render(<FormSkeleton rows={3} />)
    const busy = container.querySelector('[aria-busy="true"]')
    expect(busy).toBeTruthy()
    // 2 标题块 + 3 行 × 2 块
    expect(screen.getAllByTestId('skeleton')).toHaveLength(8)
  })

  it('默认 4 行', () => {
    render(<FormSkeleton />)
    expect(screen.getAllByTestId('skeleton')).toHaveLength(10)
  })
})
