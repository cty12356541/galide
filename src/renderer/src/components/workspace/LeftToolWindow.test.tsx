/**
 * LeftToolWindow 浮出按钮测试 (PR3-A)
 *
 * 覆盖:
 *   - 默认渲染时浮出按钮存在
 *   - 点浮出 → addFloatingPanel('left-tool-window')
 *   - 浮出失败 → removeFloatingPanel + error store
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LeftToolWindow } from './LeftToolWindow.js'
import { useUiStore, useErrorStore } from '../../lib/store.js'
// mock 子 panel(避免 PixiJS / CodeMirror 跑不起来)
vi.mock('@renderer/features/script-editor/ScriptFileTree', () => ({
  ScriptFileTree: () => <div data-testid="script-file-tree-stub" />
}))
vi.mock('@renderer/features/asset/AssetListPanel', () => ({
  AssetListPanel: () => <div data-testid="asset-list-stub" />
}))
vi.mock('@renderer/features/git/GitPanel', () => ({
  GitPanel: () => <div data-testid="git-panel-stub" />
}))

const setGalideMock = (api: {
  openPanel: (args: { panelId: string }) => Promise<unknown>
}): void => {
  const w = window as unknown as {
    galide: { workspace: { openPanel: typeof api.openPanel } & Record<string, unknown> } & Record<string, unknown>
  }
  w.galide = {
    ...w.galide,
    workspace: { ...(w.galide?.workspace ?? {}), openPanel: api.openPanel }
  }
}

const resetStores = (): void => {
  useUiStore.setState({
    projectPath: '/p',
    projectName: 'demo',
    manifest: null,
    activeScriptFile: 'chapter1.gal',
    workspacePreset: 'writing',
    leftPanelOpen: true,
    leftPanel: 'project',
    aiPanelOpen: true,
    aiDockedLocation: 'right',
    floatingPanels: []
  })
  useErrorStore.setState({ entries: [] })
}

describe('LeftToolWindow 浮出按钮 (PR3-A)', () => {
  beforeEach(() => {
    resetStores()
  })

  it('header 渲染浮出按钮', () => {
    setGalideMock({ openPanel: () => Promise.resolve({ ok: true, windowId: 1 }) })
    render(<LeftToolWindow />)
    expect(screen.getByTestId('left-float')).toBeTruthy()
  })

  it('点浮出 → 调用 openPanel + addFloatingPanel', async () => {
    const openPanel = vi.fn(() => Promise.resolve({ ok: true as const, windowId: 7 }))
    setGalideMock({ openPanel })
    render(<LeftToolWindow />)
    fireEvent.click(screen.getByTestId('left-float'))
    await waitFor(() => {
      expect(openPanel).toHaveBeenCalledWith({ panelId: 'left-tool-window' })
    })
    expect(useUiStore.getState().floatingPanels).toContain('left-tool-window')
  })

  it('浮出 IPC 失败 → removeFloatingPanel + error store', async () => {
    setGalideMock({
      openPanel: () => Promise.resolve({ ok: false, error: 'mock fail' })
    })
    render(<LeftToolWindow />)
    fireEvent.click(screen.getByTestId('left-float'))
    await waitFor(() => {
      const entries = useErrorStore.getState().entries
      expect(entries.some((e) => e.code === 'PANEL_FLOAT_FAILED')).toBe(true)
    })
    // 失败时回滚 store
    expect(useUiStore.getState().floatingPanels).not.toContain('left-tool-window')
  })

  it('浮出 IPC 异常(throw)→ 同样回滚 + error', async () => {
    setGalideMock({
      openPanel: () => Promise.reject(new Error('network fail'))
    })
    render(<LeftToolWindow />)
    fireEvent.click(screen.getByTestId('left-float'))
    await waitFor(() => {
      const entries = useErrorStore.getState().entries
      expect(entries.some((e) => e.code === 'PANEL_FLOAT_FAILED')).toBe(true)
    })
    expect(useUiStore.getState().floatingPanels).not.toContain('left-tool-window')
  })
})
