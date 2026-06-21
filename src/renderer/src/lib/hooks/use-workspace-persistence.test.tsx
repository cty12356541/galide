/**
 * useWorkspacePersistence 单测(P5c)
 *
 * 覆盖核心不变量:
 *   - 合法布局 hydrate 覆盖默认
 *   - 非法/坏数据静默丢弃,沿用默认
 *   - 变更后防抖写回 localStorage
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkspacePersistence, WORKSPACE_LAYOUT_KEY } from './use-workspace-persistence.js'
import { useUiStore } from '../store.js'

// happy-dom 部分版本不在 window 上挂 localStorage → 补一个内存版(仅测试用)
const ensureLocalStorage = (): void => {
  if (window.localStorage) return
  const g = globalThis as unknown as { localStorage?: Storage }
  if (g.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: g.localStorage, configurable: true })
    return
  }
  const store = new Map<string, string>()
  const ls = {
    getItem: (k: string): string | null => store.get(k) ?? null,
    setItem: (k: string, v: string): void => {
      store.set(k, v)
    },
    removeItem: (k: string): void => {
      store.delete(k)
    },
    clear: (): void => {
      store.clear()
    },
    key: (i: number): string | null => Array.from(store.keys())[i] ?? null,
    get length(): number {
      return store.size
    }
  }
  Object.defineProperty(window, 'localStorage', { value: ls, configurable: true })
}
ensureLocalStorage()

describe('useWorkspacePersistence — P5c', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useUiStore.setState({
      dockSide: { project: 'left', git: 'left', outline: 'left', character: 'left', ai: 'right' },
      visiblePerSide: { left: 'project', right: 'ai', bottom: null },
      activeSubIsland: { project: 'scripts', git: 'git', outline: 'outline', character: 'profiles', ai: 'ai' }
    })
  })

  it('hydrate 合法布局覆盖默认', async () => {
    window.localStorage.setItem(
      WORKSPACE_LAYOUT_KEY,
      JSON.stringify({
        dockSide: { project: 'bottom', git: 'left', outline: 'left', character: 'left', ai: 'left' },
        visiblePerSide: { left: 'git', right: null, bottom: 'project' },
        activeSubIsland: { project: 'scripts', git: 'git', outline: 'outline', character: 'profiles', ai: 'ai' }
      })
    )
    await act(async () => {
      renderHook(() => useWorkspacePersistence())
    })
    expect(useUiStore.getState().dockSide.project).toBe('bottom')
    expect(useUiStore.getState().visiblePerSide.left).toBe('git')
    expect(useUiStore.getState().visiblePerSide.bottom).toBe('project')
  })

  it('hydrate 非法布局(dockSide 缺值)静默丢弃', async () => {
    window.localStorage.setItem(
      WORKSPACE_LAYOUT_KEY,
      JSON.stringify({
        dockSide: { project: 'left' },
        visiblePerSide: { left: 'project', right: null, bottom: null },
        activeSubIsland: { project: 'scripts', git: 'git', outline: 'outline', character: 'profiles', ai: 'ai' }
      })
    )
    await act(async () => {
      renderHook(() => useWorkspacePersistence())
    })
    expect(useUiStore.getState().dockSide.ai).toBe('right')
    expect(useUiStore.getState().visiblePerSide.left).toBe('project')
  })

  it('hydrate 坏 JSON 静默丢弃', async () => {
    window.localStorage.setItem(WORKSPACE_LAYOUT_KEY, '{not json')
    await act(async () => {
      renderHook(() => useWorkspacePersistence())
    })
    expect(useUiStore.getState().dockSide.ai).toBe('right')
  })

  it('persist 变更后写回 localStorage', async () => {
    await act(async () => {
      renderHook(() => useWorkspacePersistence())
    })
    act(() => {
      useUiStore.getState().setDockSide('ai', 'bottom')
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400))
    })
    const raw = window.localStorage.getItem(WORKSPACE_LAYOUT_KEY)
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw as string).dockSide.ai).toBe('bottom')
  })
})
