/**
 * LeftToolWindow 占位主岛测试(功能即岛 v2)
 *
 * LeftToolWindow 仅承载 search/debug/settings 三个占位主岛,接收 placeholderId prop。
 * 覆盖:各占位渲染对应标题/描述;占位无浮出按钮;关闭按钮收起左槽。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LeftToolWindow } from './LeftToolWindow.js'
import { useUiStore } from '../../lib/store.js'

const resetStores = (): void => {
  useUiStore.setState({
    visiblePerSide: { left: 'search', right: null, bottom: null },
    dockSide: { project: 'left', git: 'left', outline: 'left', character: 'left', ai: 'right' }
  })
}

describe('LeftToolWindow 占位主岛', () => {
  beforeEach(() => {
    resetStores()
  })

  it('search 占位渲染标题与描述,且无浮出按钮', () => {
    render(<LeftToolWindow placeholderId="search" />)
    expect(screen.getByTestId('placeholder-tool-window-搜索')).toBeTruthy()
    expect(screen.getByText(/跨文件全文搜索/)).toBeTruthy()
    expect(screen.queryByTestId('left-float')).toBeNull()
  })

  it('debug 占位渲染', () => {
    render(<LeftToolWindow placeholderId="debug" />)
    expect(screen.getByTestId('placeholder-tool-window-调试')).toBeTruthy()
    expect(screen.getByText(/运行\/断点/)).toBeTruthy()
  })

  it('settings 占位渲染', () => {
    render(<LeftToolWindow placeholderId="settings" />)
    expect(screen.getByTestId('placeholder-tool-window-设置')).toBeTruthy()
    expect(screen.getByText(/IDE 偏好配置/)).toBeTruthy()
  })

  it('关闭按钮收起左槽', () => {
    useUiStore.setState({ visiblePerSide: { left: 'search', right: null, bottom: null } })
    render(<LeftToolWindow placeholderId="search" />)
    fireEvent.click(screen.getByLabelText('关闭 Tool Window'))
    expect(useUiStore.getState().visiblePerSide.left).toBeNull()
  })
})
