/**
 * useKeyboardShortcuts 单测(P5a)
 *
 * 覆盖核心不变量:
 *   - 无 modal 时 ⌘, 打开偏好
 *   - modal 打开时 ⌘, 不叠弹(modal guard)
 *   - ESC 单源关闭最上层 modal
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardShortcuts } from './use-keyboard-shortcuts.js'
import { useUiStore } from '../store.js'
import { DEFAULT_SHORTCUTS } from '../command-registry.js'

/** 预置已解析快捷键(模拟 App 的 useResolvedShortcutsSync 灌入默认值) */
const presetShortcuts = (): void => {
  const resolved: Record<string, string> = {}
  for (const [id, acc] of Object.entries(DEFAULT_SHORTCUTS)) {
    if (acc) resolved[id] = acc
  }
  useUiStore.setState({ resolvedShortcuts: resolved })
}

const resetStore = (): void => {
  useUiStore.setState({
    projectPath: '/tmp/demo',
    commandPaletteOpen: false,
    commandPaletteMode: 'all',
    preferencesOpen: false,
    exportDialogOpen: false,
    commitDialogOpen: false,
    newProjectDialogOpen: false,
    shortcutRecording: false
  })
  presetShortcuts()
}

const press = (key: string, opts: KeyboardEventInit = {}): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }))
}

describe('useKeyboardShortcuts — P5a', () => {
  beforeEach(() => {
    resetStore()
    renderHook(() => useKeyboardShortcuts())
  })

  it('无 modal 时 ⌘, 打开偏好', () => {
    act(() => press(',', { metaKey: true }))
    expect(useUiStore.getState().preferencesOpen).toBe(true)
  })

  it('命令面板打开时 ☄, 不叠弹偏好(modal guard)', () => {
    useUiStore.setState({ commandPaletteOpen: true })
    act(() => press(',', { metaKey: true }))
    expect(useUiStore.getState().preferencesOpen).toBe(false)
    expect(useUiStore.getState().commandPaletteOpen).toBe(true)
  })

  it('ESC 关闭最上层 modal(命令面板)', () => {
    useUiStore.setState({ commandPaletteOpen: true, preferencesOpen: true })
    act(() => press('Escape'))
    // 优先级:命令面板先关,偏好仍开
    expect(useUiStore.getState().commandPaletteOpen).toBe(false)
    expect(useUiStore.getState().preferencesOpen).toBe(true)
  })

  it('ESC 再按一次关闭偏好(逐层)', () => {
    useUiStore.setState({ commandPaletteOpen: true, preferencesOpen: true })
    act(() => press('Escape'))
    act(() => press('Escape'))
    expect(useUiStore.getState().preferencesOpen).toBe(false)
  })

  it('无 modal 时 ESC 不改变状态', () => {
    act(() => press('Escape'))
    expect(useUiStore.getState().commandPaletteOpen).toBe(false)
    expect(useUiStore.getState().preferencesOpen).toBe(false)
  })

  it('⌘P 以文件模式打开命令面板(Go to File)', () => {
    act(() => press('p', { metaKey: true }))
    expect(useUiStore.getState().commandPaletteOpen).toBe(true)
    expect(useUiStore.getState().commandPaletteMode).toBe('file')
  })

  it('⌘K 以全命令模式打开', () => {
    act(() => press('k', { metaKey: true }))
    expect(useUiStore.getState().commandPaletteOpen).toBe(true)
    expect(useUiStore.getState().commandPaletteMode).toBe('all')
  })
})
