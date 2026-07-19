/**
 * use-command-dispatcher 单测(T1-2)
 *
 * 覆盖核心不变量:
 *   - 每个 COMMANDS 条目都注册了可调用的 handler(一条命令 → 一条执行路径)
 *   - handler 映射到真实 store 动作 / 注入的 IPC hook
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCommandDispatcher } from './use-command-dispatcher.js'
import { dispatchCommand } from '../command-dispatcher.js'
import { COMMANDS } from '../command-registry.js'
import { useUiStore } from '../store.js'

const mocks = vi.hoisted(() => ({
  newScriptFile: vi.fn(),
  openProject: vi.fn(),
  closeProject: vi.fn(),
  float: vi.fn(),
  confirmDialog: vi.fn<(opts: unknown) => Promise<boolean>>()
}))

vi.mock('./use-new-script-file.js', () => ({ useNewScriptFile: () => mocks.newScriptFile }))
vi.mock('../ipc/use-project.js', () => ({ useProject: () => ({ open: mocks.openProject }) }))
vi.mock('./use-panel-float.js', () => ({ usePanelFloat: () => mocks.float }))
vi.mock('../promise-dialog-store.js', () => ({ confirmDialog: mocks.confirmDialog }))
vi.mock('../project-coordinator.js', () => ({
  useCloseProject: () => mocks.closeProject,
  useOpenProject: () => vi.fn(),
  openProject: vi.fn(),
  closeProject: vi.fn(),
  openCharacterFromOutline: vi.fn()
}))

describe('useCommandDispatcher — T1-2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.confirmDialog.mockResolvedValue(true)
    useUiStore.setState({
      projectPath: '/tmp/demo',
      commandPaletteOpen: false,
      exportDialogOpen: false,
      commitDialogOpen: false,
      newProjectDialogOpen: false
    })
    renderHook(() => useCommandDispatcher())
  })

  it('每个 COMMANDS 命令都注册了可调用的 handler', async () => {
    for (const cmd of COMMANDS) {
      const r = await dispatchCommand(cmd.id)
      expect(r.ok, cmd.id).toBe(true)
    }
  })

  it('export → 打开导出对话框', async () => {
    await dispatchCommand('export')
    expect(useUiStore.getState().exportDialogOpen).toBe(true)
  })

  it('toggleAi → toggleAiPanel(AI 主岛可见性翻转)', async () => {
    const before = useUiStore.getState().panelStates.ai?.visible
    await dispatchCommand('toggleAi')
    expect(useUiStore.getState().panelStates.ai?.visible).toBe(!before)
  })

  it('openProject / newScriptFile / closeProject / floatAi 走注入的 hook', async () => {
    await dispatchCommand('openProject')
    expect(mocks.openProject).toHaveBeenCalled()
    await dispatchCommand('newScriptFile')
    expect(mocks.newScriptFile).toHaveBeenCalled()
    await dispatchCommand('closeProject')
    await vi.waitFor(() => expect(mocks.closeProject).toHaveBeenCalled())
    await dispatchCommand('floatAi')
    expect(mocks.float).toHaveBeenCalledWith('ai')
  })

  it('closeProject:确认对话框取消时不执行关闭', async () => {
    mocks.confirmDialog.mockResolvedValue(false)
    await dispatchCommand('closeProject')
    await vi.waitFor(() => expect(mocks.confirmDialog).toHaveBeenCalled())
    expect(mocks.closeProject).not.toHaveBeenCalled()
  })

  it('presetReview → 工作区切评审', async () => {
    await dispatchCommand('presetReview')
    expect(useUiStore.getState().workspacePreset).toBe('review')
  })

  it('toggleTheme → 主题翻转', async () => {
    const before = useUiStore.getState().theme
    await dispatchCommand('toggleTheme')
    expect(useUiStore.getState().theme).toBe(before === 'dark' ? 'light' : 'dark')
  })
})
