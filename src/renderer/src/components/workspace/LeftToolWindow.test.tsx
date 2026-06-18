/**
 * LeftToolWindow 占位项测试
 *
 * 功能模块即岛重构后,LeftToolWindow 仅承载 search/debug/settings 三个占位项。
 * 覆盖:
 *   - 各占位项渲染对应标题/描述
 *   - 占位项无浮出按钮(未实现工具窗不可浮出)
 *   - 关闭按钮调用 toggleLeftPanel
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LeftToolWindow } from './LeftToolWindow.js'
import { useUiStore } from '../../lib/store.js'

const resetStores = (): void => {
  useUiStore.setState({
    projectPath: '/p',
    activitySelection: 'search',
    leftPanelOpen: true
  })
}

describe('LeftToolWindow 占位项', () => {
  beforeEach(() => {
    resetStores()
  })

  it('search 占位渲染标题与描述,且无浮出按钮', () => {
    useUiStore.setState({ activitySelection: 'search' })
    render(<LeftToolWindow />)
    expect(screen.getByTestId('placeholder-tool-window-搜索')).toBeTruthy()
    expect(screen.getByText(/跨文件全文搜索/)).toBeTruthy()
    expect(screen.queryByTestId('left-float')).toBeNull()
  })

  it('debug 占位渲染', () => {
    useUiStore.setState({ activitySelection: 'debug' })
    render(<LeftToolWindow />)
    expect(screen.getByTestId('placeholder-tool-window-调试')).toBeTruthy()
    expect(screen.getByText(/运行\/断点/)).toBeTruthy()
  })

  it('settings 占位渲染', () => {
    useUiStore.setState({ activitySelection: 'settings' })
    render(<LeftToolWindow />)
    expect(screen.getByTestId('placeholder-tool-window-设置')).toBeTruthy()
    expect(screen.getByText(/IDE 偏好配置/)).toBeTruthy()
  })

  it('关闭按钮调用 toggleLeftPanel', () => {
    useUiStore.setState({ activitySelection: 'search', leftPanelOpen: true })
    render(<LeftToolWindow />)
    fireEvent.click(screen.getByLabelText('关闭 Tool Window'))
    expect(useUiStore.getState().leftPanelOpen).toBe(false)
  })
})
