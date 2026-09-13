/**
 * Toolbar 命令注册表接线测试
 *
 * 验证:
 *   - 每个有注册表命令的按钮 tooltip = 命令 label + acceleratorLabel(有效快捷键)
 *   - 用户重绑快捷键(resolvedShortcuts 覆盖)后 tooltip 同步更新
 *   - 点击经 dispatchCommand 路由到注册的 handler(commit / openPreferences)
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Toolbar } from './Toolbar'
import { useUiStore } from '../lib/store'
import {
  acceleratorLabel,
  effectiveShortcut,
  COMMAND_LABELS,
  type CommandId
} from '../lib/command-registry'
import { WORKSPACE_PRESET_DEFAULTS } from '../lib/workspace-presets'

/** 与 Toolbar.commandTitle 同一公式:label + acceleratorLabel(effectiveShortcut) */
const expectedTitle = (id: CommandId, overrides: Record<string, string> = {}): string => {
  const hint = acceleratorLabel(effectiveShortcut(id, overrides))
  return hint ? `${COMMAND_LABELS[id]} (${hint})` : COMMAND_LABELS[id]
}

beforeEach(() => {
  useUiStore.setState({
    projectPath: '/tmp/demo',
    projectName: 'demo',
    manifest: null,
    activeScriptFile: null,
    workspacePreset: 'writing',
    panelStates: { ...WORKSPACE_PRESET_DEFAULTS.writing.panelStates },
    theme: 'light',
    preferencesOpen: false,
    commandPaletteOpen: false,
    exportDialogOpen: false,
    commitDialogOpen: false,
    newProjectDialogOpen: false,
    shortcutRecording: false,
    resolvedShortcuts: {}
  })
})

describe('Toolbar 命令注册表接线', () => {
  it('各命令按钮 tooltip 等于注册表派生标签', () => {
    render(<Toolbar />)
    expect(screen.getByTitle(expectedTitle('commit'))).toBeTruthy()
    expect(screen.getByTitle(expectedTitle('export'))).toBeTruthy()
    expect(screen.getByTitle(expectedTitle('toggleAi'))).toBeTruthy()
    expect(screen.getByTitle(expectedTitle('toggleTheme'))).toBeTruthy()
    expect(screen.getByTitle(expectedTitle('openPreferences'))).toBeTruthy()
  })

  it('无项目时"打开项目"按钮 tooltip 来自注册表', () => {
    useUiStore.setState({ projectPath: null, projectName: null })
    render(<Toolbar />)
    expect(screen.getByTitle(expectedTitle('openProject'))).toBeTruthy()
  })

  it('重绑快捷键后 tooltip 同步变化', () => {
    render(<Toolbar />)
    act(() => {
      useUiStore.setState({
        resolvedShortcuts: { toggleAi: 'Ctrl+Shift+A', commit: 'Meta+Alt+C' }
      })
    })
    expect(
      screen.getByTitle(expectedTitle('toggleAi', { toggleAi: 'Ctrl+Shift+A' }))
    ).toBeTruthy()
    expect(screen.getByTitle(expectedTitle('commit', { commit: 'Meta+Alt+C' }))).toBeTruthy()
    // 旧默认 tooltip 不再存在
    expect(screen.queryByTitle(expectedTitle('toggleAi'))).toBeNull()
    expect(screen.queryByTitle(expectedTitle('commit'))).toBeNull()
  })

  it('点击 Git 按钮经 dispatchCommand 打开提交对话框', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByTitle(expectedTitle('commit')))
    expect(useUiStore.getState().commitDialogOpen).toBe(true)
  })

  it('点击偏好按钮经 dispatchCommand 打开偏好设置', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByTitle(expectedTitle('openPreferences')))
    expect(useUiStore.getState().preferencesOpen).toBe(true)
  })

  it('点击主题按钮经 dispatchCommand 切换主题', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByTitle(expectedTitle('toggleTheme')))
    expect(useUiStore.getState().theme).toBe('dark')
  })
})
