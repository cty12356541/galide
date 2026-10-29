/**
 * ScriptFileTree 组件测试(Phase 1 T1-1 + T1-2)
 *
 * 覆盖:
 * 1. buildScriptTree 嵌套目录结构与排序(目录在前,文件在后)
 * 2. 子目录折叠/展开展示
 * 3. Radix ContextMenu 打开、键盘导航(ArrowDown/Enter/Escape)与动作触发
 * 4. 删除经 ConfirmDialog 确认后调用 script.delete、列表刷新且切换 activeScript
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ScriptFileTree, buildScriptTree } from './ScriptFileTree'
import { useUiStore, useErrorStore } from '../../lib/store'
import { promiseDialogStore } from '../../lib/promise-dialog-store'

interface MockGalideScript {
  list: ReturnType<typeof vi.fn>
  read: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  parse: ReturnType<typeof vi.fn>
}

describe('buildScriptTree', () => {
  it('groups nested paths into sorted folders before root files', () => {
    const tree = buildScriptTree(['prologue.gal', 'act2/end.gal', 'act1/ch2.gal', 'act1/sub/ch1.gal'])
    expect(tree).toEqual([
      {
        kind: 'folder',
        name: 'act1',
        path: 'act1',
        children: [
          {
            kind: 'folder',
            name: 'sub',
            path: 'act1/sub',
            children: [{ kind: 'file', name: 'ch1.gal', path: 'act1/sub/ch1.gal' }]
          },
          { kind: 'file', name: 'ch2.gal', path: 'act1/ch2.gal' }
        ]
      },
      {
        kind: 'folder',
        name: 'act2',
        path: 'act2',
        children: [{ kind: 'file', name: 'end.gal', path: 'act2/end.gal' }]
      },
      { kind: 'file', name: 'prologue.gal', path: 'prologue.gal' }
    ])
  })
})

describe('ScriptFileTree', () => {
  let currentFiles: string[]
  let mockScript: MockGalideScript

  beforeEach(() => {
    currentFiles = ['act1/ch1.gal', 'act1/sub/ch2.gal', 'prologue.gal']
    mockScript = {
      list: vi.fn(async () => [...currentFiles]),
      read: vi.fn(async () => '# content\n'),
      write: vi.fn(async (_proj: string, fileName: string) => {
        if (!currentFiles.includes(fileName)) currentFiles.push(fileName)
        return { ok: true }
      }),
      delete: vi.fn(async (_proj: string, fileName: string) => {
        currentFiles = currentFiles.filter((f) => f !== fileName)
        return { ok: true }
      }),
      parse: vi.fn()
    }
    ;(window as unknown as { galide: { script: MockGalideScript } }).galide = {
      ...((window as unknown as { galide?: Record<string, unknown> }).galide ?? {}),
      script: mockScript
    }
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => undefined) },
      configurable: true
    })
    promiseDialogStore.setState({ pending: null })
    useErrorStore.getState().clear()
    useUiStore.setState({
      projectPath: '/mock/proj',
      activeScriptFile: 'act1/ch1.gal',
      promiseDialogOpen: false
    })
  })

  it('renders nested folders and toggles folder collapse', async () => {
    render(<ScriptFileTree />)
    expect(await screen.findByTestId('script-folder-act1')).toBeTruthy()
    expect(screen.getByTestId('script-folder-act1/sub')).toBeTruthy()
    expect(screen.getByTestId('script-file-act1/ch1.gal')).toBeTruthy()
    expect(screen.getByTestId('script-file-act1/sub/ch2.gal')).toBeTruthy()
    expect(screen.getByTestId('script-file-prologue.gal')).toBeTruthy()

    // Collapse act1 folder -> nested items disappear
    fireEvent.click(screen.getByTestId('script-folder-act1'))
    expect(screen.queryByTestId('script-file-act1/ch1.gal')).toBeNull()
    expect(screen.getByTestId('script-file-prologue.gal')).toBeTruthy()

    // Expand act1 folder -> nested items reappear
    fireEvent.click(screen.getByTestId('script-folder-act1'))
    expect(screen.getByTestId('script-file-act1/ch1.gal')).toBeTruthy()
  })

  it('opens Radix ContextMenu on right-click, supports keyboard navigation and Escape', async () => {
    render(<ScriptFileTree />)
    const target = await screen.findByTestId('script-file-prologue.gal')

    fireEvent.contextMenu(target)
    const menu = await screen.findByTestId('file-context-menu')
    expect(menu.getAttribute('role')).toBe('menu')

    const items = screen.getAllByRole('menuitem')
    expect(items.map((el) => el.textContent)).toEqual(['复制文件名', '重命名', '删除'])

    // Keyboard navigation: ArrowDown focuses menu item, Enter activates it
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    fireEvent.keyDown(items[0]!, { key: 'Enter' })
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('prologue.gal')
    })

    // Reopen and close with Escape
    fireEvent.contextMenu(target)
    const reopened = await screen.findByTestId('file-context-menu')
    fireEvent.keyDown(reopened, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByTestId('file-context-menu')).toBeNull()
    })
  })

  it('confirms deletion via danger ConfirmDialog, deletes script, refreshes list, and updates activeScript', async () => {
    render(<ScriptFileTree />)
    const activeItem = await screen.findByTestId('script-file-act1/ch1.gal')

    fireEvent.contextMenu(activeItem)
    const deleteMenuItem = await screen.findByRole('menuitem', { name: '删除' })
    fireEvent.click(deleteMenuItem)

    // ConfirmDialog opens
    expect(await screen.findByText('删除剧本文件')).toBeTruthy()
    const confirmButtons = screen.getAllByRole('button', { name: '删除' })
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!)

    await waitFor(() => {
      expect(mockScript.delete).toHaveBeenCalledWith('/mock/proj', 'act1/ch1.gal')
    })
    await waitFor(() => {
      expect(screen.queryByTestId('script-file-act1/ch1.gal')).toBeNull()
    })
    expect(useUiStore.getState().activeScriptFile).toBe('act1/sub/ch2.gal')
  })
})
