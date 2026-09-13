/**
 * CommandPalette 组件测试(T1-4)
 *
 * 覆盖核心不变量:
 *   - 命令模式渲染 COMMANDS 全部条目(单一真相源,不再手写列表)
 *   - 每条命令显示有效快捷键标签(acceleratorLabel(用户覆盖 ?? 默认))
 *   - 重绑定快捷键即时反映
 *   - 选中命令 → dispatchCommand(id) + 关闭面板
 *   - requiresProject 守卫:无打开项目时隐藏项目级命令
 *   - 跳转到文件模式保持原样(文件列表,不显示命令)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommandPalette } from './CommandPalette'
import { COMMANDS, DEFAULT_SHORTCUTS, acceleratorLabel } from '../../lib/command-registry'
import { useUiStore } from '../../lib/store'

const mocks = vi.hoisted(() => {
  const dispatch = vi.fn((_id: string) => Promise.resolve({ ok: true }))
  const listFiles = vi.fn((_path: string) => Promise.resolve([] as string[]))
  // 稳定引用:真实 useScript 的方法经 useCallback 稳定;组件 effect 以 script 为依赖,
  // 每次渲染返回新对象会造成 effect → setFiles → 重渲染死循环
  const scriptApi = { list: (path: string) => listFiles(path) }
  return { dispatch, listFiles, scriptApi }
})

vi.mock('../../lib/hooks/use-command-dispatcher.js', () => ({
  useCommandDispatcher: () => ({ dispatchCommand: mocks.dispatch })
}))
vi.mock('../../lib/ipc/use-script.js', () => ({
  useScript: () => mocks.scriptApi
}))

/** 默认快捷键灌入 store.resolvedShortcuts(模拟 useResolvedShortcutsSync) */
const defaultResolved = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(DEFAULT_SHORTCUTS).filter((e): e is [string, string] => typeof e[1] === 'string')
  )

describe('CommandPalette — T1-4', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dispatch.mockImplementation((_id: string) => Promise.resolve({ ok: true }))
    mocks.listFiles.mockImplementation((_path: string) => Promise.resolve([]))
    useUiStore.setState({
      commandPaletteOpen: true,
      commandPaletteMode: 'all',
      projectPath: '/tmp/demo',
      scriptAst: null,
      resolvedShortcuts: defaultResolved()
    })
  })

  it('命令模式渲染 COMMANDS 全部条目', () => {
    render(<CommandPalette />)
    expect(screen.getAllByRole('option')).toHaveLength(COMMANDS.length)
    for (const cmd of COMMANDS) {
      expect(screen.getByText(cmd.label)).toBeTruthy()
    }
  })

  it('每条有默认快捷键的命令显示快捷键标签', () => {
    render(<CommandPalette />)
    for (const cmd of COMMANDS) {
      if (cmd.default == null) continue
      const hint = acceleratorLabel(cmd.default)
      if (!hint) continue
      expect(screen.getByText(hint), cmd.id).toBeTruthy()
    }
  })

  it('重绑定快捷键即时反映(用户覆盖优先)', () => {
    useUiStore.setState({
      resolvedShortcuts: { ...defaultResolved(), commandPalette: 'Ctrl+Shift+P' }
    })
    render(<CommandPalette />)
    expect(screen.getByText(acceleratorLabel('Ctrl+Shift+P') ?? '')).toBeTruthy()
    expect(screen.queryByText(acceleratorLabel('Meta+K') ?? '')).toBeNull()
  })

  it('选中命令 → dispatchCommand(id) 并关闭面板', () => {
    render(<CommandPalette />)
    fireEvent.click(screen.getByText('Git 提交'))
    expect(mocks.dispatch).toHaveBeenCalledWith('commit')
    expect(useUiStore.getState().commandPaletteOpen).toBe(false)
  })

  it('无打开项目时隐藏 requiresProject 命令', () => {
    useUiStore.setState({ projectPath: null })
    render(<CommandPalette />)
    const guarded = COMMANDS.filter((c) => c.requiresProject).length
    expect(screen.getAllByRole('option')).toHaveLength(COMMANDS.length - guarded)
    expect(screen.queryByText('Git 提交')).toBeNull()
  })

  it('跳转到文件模式:仅文件列表,不显示命令', async () => {
    mocks.listFiles.mockImplementation((_path: string) => Promise.resolve(['intro.gal']))
    useUiStore.setState({ commandPaletteMode: 'file' })
    render(<CommandPalette />)
    expect(await screen.findByText('intro.gal')).toBeTruthy()
    expect(screen.queryByText('命令面板')).toBeNull()
  })
})
