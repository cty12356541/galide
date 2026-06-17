/**
 * FloatingPanelHost 单测
 *
 * 覆盖:
 *   - 非 floating 模式(无 query)→ 返 null
 *   - floating=1 但 panelId 缺失 → 返 null
 *   - floating=1 + 合法 panelId → 渲染 header + 关闭按钮 + panel
 *   - 关闭按钮调 window.close
 *   - 非法 panelId → 返 null
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FloatingPanelHost, isFloatingWindow } from './FloatingPanelHost.js'

// happy-dom 不提供 canvas / WebGL,PixiJS 等组件无法真实渲染
// 用 stub 替代,只验证 FloatingPanelHost 的路由行为
vi.mock('@renderer/features/preview/PreviewCanvas', () => ({
  PreviewCanvas: () => <div data-testid="preview-stub" />
}))
vi.mock('@renderer/features/flow-view/FlowView', () => ({
  FlowView: () => <div data-testid="flow-stub" />
}))
vi.mock('@renderer/features/script-editor/ScriptEditor', () => ({
  ScriptEditor: () => <div data-testid="editor-stub" />
}))

// 在 beforeEach 重置时挂上 focusMain stub(每个 test 独立)
const focusMainMock = vi.fn(() => Promise.resolve({ ok: true }))

const setSearch = (search: string): void => {
  // happy-dom 下改 window.location.search
  // 用 history.replaceState 改 URL 而不刷新
  const url = search
    ? `http://localhost:3000/${search}`
    : 'http://localhost:3000/'
  window.history.replaceState({}, '', url)
}

const resetSearch = (): void => {
  setSearch('')
}

const setupGalide = (): void => {
  const w = window as unknown as {
    galide: { workspace: { focusMain: typeof focusMainMock } & Record<string, unknown> } & Record<string, unknown>
  }
  focusMainMock.mockClear()
  w.galide = {
    ...w.galide,
    workspace: { ...(w.galide?.workspace ?? {}), focusMain: focusMainMock }
  }
}

describe('isFloatingWindow', () => {
  it('URL 无 query → false', () => {
    setSearch('')
    expect(isFloatingWindow()).toBe(false)
  })

  it('URL 有 floating=1 + 合法 panelId → true', () => {
    setSearch('?floating=1&panelId=script-editor')
    expect(isFloatingWindow()).toBe(true)
  })

  it('URL 有 floating=1 + 非法 panelId → false', () => {
    setSearch('?floating=1&panelId=bogus')
    expect(isFloatingWindow()).toBe(false)
  })

  it('URL 有 panelId 但无 floating=1 → false', () => {
    setSearch('?panelId=script-editor')
    expect(isFloatingWindow()).toBe(false)
  })

  it('floating=0(显式禁用)→ false', () => {
    setSearch('?floating=0&panelId=script-editor')
    expect(isFloatingWindow()).toBe(false)
  })
})

describe('FloatingPanelHost', () => {
  beforeEach(() => {
    resetSearch()
    setupGalide()
  })

  afterEach(() => {
    resetSearch()
  })

  it('非 floating 模式 → 返 null', () => {
    const { container } = render(<FloatingPanelHost />)
    expect(container.firstChild).toBeNull()
  })

  it('floating=1 但 panelId 缺失 → 返 null', () => {
    setSearch('?floating=1')
    const { container } = render(<FloatingPanelHost />)
    expect(container.firstChild).toBeNull()
  })

  it('floating=1 + 合法 panelId → 渲染 header + 关闭按钮', () => {
    setSearch('?floating=1&panelId=script-editor')
    render(<FloatingPanelHost />)
    expect(screen.getByTestId('floating-host')).toBeTruthy()
    expect(screen.getByTestId('floating-header')).toBeTruthy()
    expect(screen.getByTestId('floating-close')).toBeTruthy()
  })

  it('关闭按钮存在且可点(不报错)', () => {
    setSearch('?floating=1&panelId=flow-view')
    // mock window.close
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined)
    render(<FloatingPanelHost />)
    const btn = screen.getByTestId('floating-close')
    fireEvent.click(btn)
    expect(closeSpy).toHaveBeenCalledTimes(1)
    closeSpy.mockRestore()
  })

  it('非法 panelId → 返 null', () => {
    setSearch('?floating=1&panelId=evil')
    const { container } = render(<FloatingPanelHost />)
    expect(container.firstChild).toBeNull()
  })

  it('panel 切换:script-editor / flow-view / preview-canvas 都能渲染', () => {
    const ids = ['script-editor', 'flow-view', 'preview-canvas']
    for (const id of ids) {
      resetSearch()
      setSearch(`?floating=1&panelId=${id}`)
      const { unmount } = render(<FloatingPanelHost />)
      expect(screen.getByTestId('floating-host')).toBeTruthy()
      expect(screen.getByTestId('floating-content')).toBeTruthy()
      unmount()
    }
  })

  it('"返回主窗口" 按钮存在且可点', () => {
    setSearch('?floating=1&panelId=script-editor')
    render(<FloatingPanelHost />)
    const btn = screen.getByTestId('floating-back')
    expect(btn).toBeTruthy()
    fireEvent.click(btn)
    expect(focusMainMock).toHaveBeenCalledTimes(1)
  })

  it('"返回主窗口" 失败不抛错', () => {
    setSearch('?floating=1&panelId=script-editor')
    focusMainMock.mockImplementationOnce(() => Promise.resolve({ ok: false }))
    render(<FloatingPanelHost />)
    const btn = screen.getByTestId('floating-back')
    expect(() => fireEvent.click(btn)).not.toThrow()
  })
})
