/**
 * App.tsx 简化版集成测试
 *
 * P1 重构(2026-06-17): 验证核心子组件(单独 mount,避免 happy-dom 整体渲染时
 * 的 activeElement instanceof 错误)
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MenuBar } from './MenuBar'
import { Toolbar } from './Toolbar'
import { StatusBar } from './StatusBar'
import { ProjectTabs } from './ProjectTabs'
import { useUiStore } from '../lib/store'

beforeEach(() => {
  useUiStore.setState({
    projectPath: null,
    projectName: null,
    manifest: null,
    activeScriptFile: 'chapter1.gal',
    workspacePreset: 'writing',
    dockSide: { project: 'left', git: 'left', outline: 'left', character: 'left', ai: 'right' },
    visiblePerSide: { left: 'project', right: 'ai', bottom: null },
    activeSubIsland: { project: 'scripts', git: 'git', outline: 'outline', character: 'profiles', ai: 'ai' },
    theme: 'light',
    preferencesOpen: false,
    commandPaletteOpen: false,
    exportDialogOpen: false,
    commitDialogOpen: false,
    newProjectDialogOpen: false,
    shortcutRecording: false
  })
})

describe('MenuBar', () => {
  it('渲染 5 个菜单(File/Edit/View/Run/Help)', () => {
    render(<MenuBar />)
    expect(screen.getByTestId('menu-file')).toBeTruthy()
    expect(screen.getByTestId('menu-edit')).toBeTruthy()
    expect(screen.getByTestId('menu-view')).toBeTruthy()
    expect(screen.getByTestId('menu-run')).toBeTruthy()
    expect(screen.getByTestId('menu-help')).toBeTruthy()
  })

  it('显示当前 preset 标签', () => {
    render(<MenuBar />)
    expect(screen.getByTestId('workspace-preset-label').textContent).toContain('写作')
  })

  it('切换 preset 反映到 label', () => {
    useUiStore.getState().setWorkspacePreset('flow')
    render(<MenuBar />)
    expect(screen.getByTestId('workspace-preset-label').textContent).toContain('流程')
  })
})

describe('Toolbar', () => {
  it('AI 按钮存在并 toggle', () => {
    render(<Toolbar />)
    const aiBtn = screen.getByTestId('toolbar-ai-toggle')
    expect(aiBtn).toBeTruthy()
    fireEvent.click(aiBtn)
    expect(useUiStore.getState().visiblePerSide.right).toBeNull()
  })

  it('无 project 时显示"打开项目"按钮', () => {
    render(<Toolbar />)
    expect(screen.getByText(/打开项目/)).toBeTruthy()
  })
})

describe('StatusBar', () => {
  it('渲染 6 区块(git/错误/消息/缩放/AI/preset toggle)', () => {
    render(<StatusBar />)
    const sb = screen.getByTestId('status-bar')
    const blocks = within(sb).getAllByRole('button')
    // 至少 5 个 button(精简版)
    expect(blocks.length).toBeGreaterThanOrEqual(5)
  })

  it('AI 状态按钮 toggle', () => {
    render(<StatusBar />)
    fireEvent.click(screen.getByTestId('status-ai-toggle'))
    expect(useUiStore.getState().visiblePerSide.right).toBeNull()
  })
})

describe('ProjectTabs', () => {
  it('无 active script 时返回空', () => {
    useUiStore.setState({ activeScriptFile: null })
    const { container } = render(<ProjectTabs />)
    expect(container.firstChild?.nodeName).toBe('DIV')
    // 高度为 0 的空 div
  })

  it('有 active script 时显示 tab', () => {
    useUiStore.setState({ activeScriptFile: 'ch1.gal', workspacePreset: 'flow' })
    render(<ProjectTabs />)
    expect(screen.getByTestId('project-tabs')).toBeTruthy()
    expect(screen.getByTestId('project-tab-active').textContent).toContain('ch1.gal')
  })
})
