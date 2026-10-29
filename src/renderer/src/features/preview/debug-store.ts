/**
 * debug-store — 预览调试器前端状态(断点表 + 变量监视列表,持久化到 localStorage)
 */
import { createStore, useStore } from 'zustand'

export const BREAKPOINTS_STORAGE_KEY = 'galide.debug.breakpoints'
export const WATCHES_STORAGE_KEY = 'galide.debug.watches'

const readStringArray = (key: string): string[] => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return []
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
  } catch {
    return []
  }
}

const writeStringArray = (key: string, items: readonly string[]): void => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(key, JSON.stringify(items))
  } catch {
    // ignore quota / private mode failures
  }
}

export interface DebugStoreState {
  breakpoints: string[]
  watchNames: string[]
  panelOpen: boolean
  toggleBreakpoint: (markerId: string) => void
  setBreakpoints: (markerIds: readonly string[]) => void
  clearBreakpoints: () => void
  addWatch: (name: string) => void
  removeWatch: (name: string) => void
  setPanelOpen: (open: boolean) => void
  togglePanelOpen: () => void
}

export const debugStore = createStore<DebugStoreState>((set) => ({
  breakpoints: readStringArray(BREAKPOINTS_STORAGE_KEY),
  watchNames: readStringArray(WATCHES_STORAGE_KEY),
  panelOpen: false,
  toggleBreakpoint: (markerId) =>
    set((s) => {
      const trimmed = markerId.trim()
      if (!trimmed) return s
      const exists = s.breakpoints.includes(trimmed)
      const next = exists
        ? s.breakpoints.filter((id) => id !== trimmed)
        : [...s.breakpoints, trimmed]
      writeStringArray(BREAKPOINTS_STORAGE_KEY, next)
      return { breakpoints: next }
    }),
  setBreakpoints: (markerIds) =>
    set(() => {
      const next = Array.from(new Set(markerIds.map((m) => m.trim()).filter(Boolean)))
      writeStringArray(BREAKPOINTS_STORAGE_KEY, next)
      return { breakpoints: next }
    }),
  clearBreakpoints: () =>
    set(() => {
      writeStringArray(BREAKPOINTS_STORAGE_KEY, [])
      return { breakpoints: [] }
    }),
  addWatch: (name) =>
    set((s) => {
      const trimmed = name.trim()
      if (!trimmed || s.watchNames.includes(trimmed)) return s
      const next = [...s.watchNames, trimmed]
      writeStringArray(WATCHES_STORAGE_KEY, next)
      return { watchNames: next }
    }),
  removeWatch: (name) =>
    set((s) => {
      const next = s.watchNames.filter((w) => w !== name)
      writeStringArray(WATCHES_STORAGE_KEY, next)
      return { watchNames: next }
    }),
  setPanelOpen: (open) => set({ panelOpen: open }),
  togglePanelOpen: () => set((s) => ({ panelOpen: !s.panelOpen }))
}))

export const useDebugStore: {
  (): DebugStoreState
  <U>(selector: (state: DebugStoreState) => U): U
  getState: typeof debugStore.getState
  setState: typeof debugStore.setState
  subscribe: typeof debugStore.subscribe
} = Object.assign(
  <U>(selector?: (state: DebugStoreState) => U) =>
    useStore(debugStore, selector ?? ((s) => s as unknown as U)),
  {
    getState: debugStore.getState.bind(debugStore),
    setState: debugStore.setState.bind(debugStore),
    subscribe: debugStore.subscribe.bind(debugStore)
  }
)

export const resetDebugStore = (): void => {
  writeStringArray(BREAKPOINTS_STORAGE_KEY, [])
  writeStringArray(WATCHES_STORAGE_KEY, [])
  debugStore.setState({ breakpoints: [], watchNames: [], panelOpen: false })
}
