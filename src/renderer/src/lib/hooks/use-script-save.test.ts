/**
 * useScriptSave — debounce / flush 单测(C1)
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScriptSave, resetScriptSaveTimer } from './use-script-save.js'
import { useUiStore } from '../store.js'

const writeMock = vi.fn(() => Promise.resolve({ ok: true as const }))

beforeEach(() => {
  resetScriptSaveTimer()
  writeMock.mockClear()
  const w = window as unknown as {
    galide: { script: { write: typeof writeMock; read: () => Promise<string>; parse: () => Promise<unknown>; list: () => Promise<string[]> } }
  }
  w.galide = {
    script: {
      write: writeMock,
      read: () => Promise.resolve(''),
      parse: () => Promise.resolve({ ok: true, value: { type: 'script', line: 1, column: 1, children: [], errors: [] } }),
      list: () => Promise.resolve([])
    }
  }
  useUiStore.setState({
    projectPath: '/tmp/p',
    activeScriptFile: 'a.gal',
    scriptSource: '## scene\n',
    scriptDirty: true,
    editorSurface: 'cards'
  })
})

afterEach(() => {
  resetScriptSaveTimer()
  useUiStore.getState().registerScriptSaveFlush(null)
})

describe('useScriptSave', () => {
  it('scheduleSave debounce 800ms 后才写盘', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useScriptSave())
    act(() => result.current.scheduleSave())
    expect(writeMock).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(799)
    })
    expect(writeMock).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(writeMock).toHaveBeenCalledTimes(1)
    expect(useUiStore.getState().scriptDirty).toBe(false)
    vi.useRealTimers()
  })

  it('flushSave 立即写盘并清 dirty', async () => {
    const { result } = renderHook(() => useScriptSave())
    await act(async () => {
      await result.current.flushSave()
    })
    expect(writeMock).toHaveBeenCalledWith('/tmp/p', 'a.gal', '## scene\n')
    expect(useUiStore.getState().scriptDirty).toBe(false)
  })

  it('flushPendingScriptSave 经 store 注册可 flush', async () => {
    renderHook(() => useScriptSave())
    await act(async () => {
      await useUiStore.getState().flushPendingScriptSave()
    })
    expect(writeMock).toHaveBeenCalledTimes(1)
  })

  // TDD-09: 模块级 debounceTimer 导致多实例竞态条件
  it('多实例下卸载一个不应清除另一个的 debounce 计时器', async () => {
    vi.useFakeTimers()
    const { unmount: unmount1 } = renderHook(() => useScriptSave())
    const { result: result2 } = renderHook(() => useScriptSave())

    // 实例2安排保存
    act(() => result2.current.scheduleSave())
    expect(writeMock).not.toHaveBeenCalled()

    // 卸载实例1 — 如果 debounceTimer 是模块级全局变量，这会清除实例2的计时器
    unmount1()

    // 快进 800ms
    await act(async () => {
      vi.advanceTimersByTime(800)
    })

    // 实例2的保存应该仍然执行
    expect(writeMock).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  // TDD-09: scriptSaveFlushImpl 模块级单例被覆盖
  it('多实例下各实例的 flushSave 独立注册，卸载一个不应注销另一个', async () => {
    vi.useFakeTimers()
    const { unmount: unmount1 } = renderHook(() => useScriptSave())
    const { result: result2 } = renderHook(() => useScriptSave())

    // 实例2安排保存
    act(() => result2.current.scheduleSave())

    // 卸载实例1 — 如果 registerScriptSaveFlush 使用模块级单例，这会注销实例2
    unmount1()

    // 通过 store 调用 flushPendingScriptSave
    await act(async () => {
      await useUiStore.getState().flushPendingScriptSave()
    })

    // 实例2的 flushSave 应该仍然被调用
    expect(writeMock).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

describe('editorSurface switching flushes pending save', () => {
  it('切到源码前 flush 清 debounce 并写盘', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useScriptSave())
    act(() => result.current.scheduleSave())
    await act(async () => {
      await useUiStore.getState().flushPendingScriptSave()
      useUiStore.getState().setEditorSurface('source')
    })
    expect(writeMock).toHaveBeenCalledTimes(1)
    expect(useUiStore.getState().editorSurface).toBe('source')
    vi.useRealTimers()
  })
})
