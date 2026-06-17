/**
 * useMosaicPersistence hook 单测
 *
 * 覆盖:
 *   - mount 时 read 一次 → 成功且 tree 非 null → setMosaicTree
 *   - read 失败(IPC 返 ok=false)→ error store 收到警告,store 不动
 *   - mosaicTree 变化触发 debounced write(短 debounce=30ms 加速)
 *   - unmount 立即 flush pending write
 *   - write 失败 → error store 收到警告
 *
 * 不用 fake timers(与 waitFor 冲突) — 用真 timer + 短 debounce(30ms)。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMosaicPersistence } from './use-mosaic-persistence.js'
import { useUiStore, useErrorStore } from '../store.js'
import type { WorkspaceMosaicNode } from '../store.js'

type WorkspaceMock = {
  readMosaic: ReturnType<typeof vi.fn>
  writeMosaic: ReturnType<typeof vi.fn>
}

const setGalideMock = (api: {
  readMosaic?: () => Promise<{ ok: boolean; tree: unknown; error?: string }>
  writeMosaic?: (args: { tree: unknown }) => Promise<{ ok: boolean; error?: string }>
}): WorkspaceMock => {
  const w = window as unknown as {
    galide: { workspace: { readMosaic: unknown; writeMosaic: unknown } & Record<string, unknown> } & Record<string, unknown>
  }
  const workspace: WorkspaceMock = {
    readMosaic: vi.fn(api.readMosaic ?? (() => Promise.resolve({ ok: true as const, tree: null }))),
    writeMosaic: vi.fn(api.writeMosaic ?? (() => Promise.resolve({ ok: true as const })))
  }
  w.galide = {
    ...w.galide,
    workspace: { ...(w.galide?.workspace ?? {}), ...workspace }
  }
  return workspace
}

const resetStores = (): void => {
  useUiStore.setState({ mosaicTree: null, floatingPanels: [] })
  useErrorStore.setState({ entries: [] })
}

const sampleTree: WorkspaceMosaicNode = {
  direction: 'row',
  first: 'script-editor',
  second: 'flow-view'
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('useMosaicPersistence', () => {
  beforeEach(() => {
    resetStores()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mount 时 readMosaic 一次,成功且 tree 非 null → setMosaicTree', async () => {
    const w = setGalideMock({
      readMosaic: () => Promise.resolve({ ok: true, tree: sampleTree })
    })
    renderHook(() => useMosaicPersistence({ debounceMs: 30 }))
    await waitFor(() => {
      expect(w.readMosaic).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(useUiStore.getState().mosaicTree).toEqual(sampleTree)
    })
  })

  it('mount 时 read 返 null → store 不动(用户后续手动 set)', async () => {
    const w = setGalideMock({ readMosaic: () => Promise.resolve({ ok: true, tree: null }) })
    renderHook(() => useMosaicPersistence({ debounceMs: 30 }))
    await waitFor(() => {
      expect(w.readMosaic).toHaveBeenCalledTimes(1)
    })
    // 留出 read 回调落定时间
    await wait(10)
    expect(useUiStore.getState().mosaicTree).toBeNull()
  })

  it('read 失败 → error store 收到警告,store 不动', async () => {
    setGalideMock({
      readMosaic: () => Promise.resolve({ ok: false, tree: null, error: 'mock read fail' })
    })
    renderHook(() => useMosaicPersistence({ debounceMs: 30 }))
    await waitFor(() => {
      const entries = useErrorStore.getState().entries
      expect(entries.length).toBe(1)
      expect(entries[0]?.code).toBe('MOSAIC_READ_FAILED')
      expect(entries[0]?.message).toContain('mock read fail')
    })
  })

  it('mosaicTree 变化触发 debounced write', async () => {
    const w = setGalideMock({})
    renderHook(() => useMosaicPersistence({ debounceMs: 30 }))
    // 等 read 回调落定
    await wait(20)
    act(() => {
      useUiStore.getState().setMosaicTree(sampleTree)
    })
    // debounce 期内不应写
    await wait(10)
    expect(w.writeMosaic).not.toHaveBeenCalled()
    // 30ms 后应写
    await waitFor(() => {
      expect(w.writeMosaic).toHaveBeenCalledTimes(1)
    })
    expect(w.writeMosaic).toHaveBeenCalledWith({ tree: sampleTree })
  })

  it('unmount 时立即 flush pending write', async () => {
    const w = setGalideMock({})
    const { unmount } = renderHook(() => useMosaicPersistence({ debounceMs: 200 }))
    await wait(20)
    act(() => {
      useUiStore.getState().setMosaicTree(sampleTree)
    })
    // debounce 未到 200ms,直接 unmount
    await wait(50)
    expect(w.writeMosaic).not.toHaveBeenCalled()
    unmount()
    expect(w.writeMosaic).toHaveBeenCalledTimes(1)
    expect(w.writeMosaic).toHaveBeenCalledWith({ tree: sampleTree })
  })

  it('write 失败 → error store 收到警告', async () => {
    setGalideMock({
      writeMosaic: () => Promise.resolve({ ok: false, error: 'mock write fail' })
    })
    renderHook(() => useMosaicPersistence({ debounceMs: 30 }))
    await wait(20)
    act(() => {
      useUiStore.getState().setMosaicTree(sampleTree)
    })
    await waitFor(() => {
      const entries = useErrorStore.getState().entries
      expect(entries.some((e) => e.code === 'MOSAIC_WRITE_FAILED')).toBe(true)
    })
  })
})
