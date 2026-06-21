/**
 * usePanelFloat hook 单测
 *
 * mosaic 引擎已移除:浮出 = addFloatingPanel + openPanel,不再操纵树。
 * 覆盖:
 *   - 浮出任意 panel → 加入 floatingPanels
 *   - 浮出 IPC 失败 → 回滚 floatingPanels
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePanelFloat } from './use-panel-float.js'
import { useUiStore } from '../store.js'

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
  useUiStore.setState({ floatingPanels: [] })
}

describe('usePanelFloat', () => {
  beforeEach(() => {
    resetStores()
  })

  it('浮出编辑器大陆(script-editor)→ 加入 floatingPanels', async () => {
    setGalideMock({ openPanel: () => Promise.resolve({ ok: true, windowId: 1 }) })
    const { result } = renderHook(() => usePanelFloat())
    act(() => {
      result.current('script-editor')
    })
    await waitFor(() => {
      expect(useUiStore.getState().floatingPanels).toContain('script-editor')
    })
  })

  it('浮出主岛(git)→ 加入 floatingPanels', async () => {
    setGalideMock({ openPanel: () => Promise.resolve({ ok: true, windowId: 1 }) })
    const { result } = renderHook(() => usePanelFloat())
    act(() => {
      result.current('git')
    })
    await waitFor(() => {
      expect(useUiStore.getState().floatingPanels).toContain('git')
    })
  })

  it('浮出子岛(voice)→ 加入 floatingPanels', async () => {
    setGalideMock({ openPanel: () => Promise.resolve({ ok: true, windowId: 1 }) })
    const { result } = renderHook(() => usePanelFloat())
    act(() => {
      result.current('voice')
    })
    await waitFor(() => {
      expect(useUiStore.getState().floatingPanels).toContain('voice')
    })
  })

  it('浮出 ipc 失败 → 回滚 floatingPanels', async () => {
    setGalideMock({
      openPanel: () => Promise.resolve({ ok: false, error: 'mock fail' })
    })
    const { result } = renderHook(() => usePanelFloat())
    act(() => {
      result.current('script-editor')
    })
    await waitFor(() => {
      expect(useUiStore.getState().floatingPanels).not.toContain('script-editor')
    })
  })
})
