/**
 * error-store — Galide renderer 端错误管理
 */
import { createStore } from 'zustand'
import { useStore } from 'zustand'
import type { ErrorEntry } from './types'

type ErrorPushInput = Omit<ErrorEntry, 'id' | 'timestamp'> & {
  id?: string
  timestamp?: number
}

export type ErrorState = {
  entries: ErrorEntry[]
  push: (entry: ErrorPushInput) => void
  dismiss: (id: string) => void
  clear: () => void
}

const MAX_ERROR_ENTRIES = 100

const errorStore = createStore<ErrorState>((set) => ({
  entries: [],
  push: (entry) =>
    set((s) => {
      const id = entry.id ?? crypto.randomUUID()
      const timestamp = entry.timestamp ?? Date.now()
      const without = s.entries.filter((e) => e.id !== id)
      const next = [{ ...entry, id, timestamp }, ...without].slice(0, MAX_ERROR_ENTRIES)
      return { entries: next }
    }),
  dismiss: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
  clear: () => set({ entries: [] })
}))

export const useErrorStore: {
  (): ErrorState
  <U>(selector: (state: ErrorState) => U): U
  getState: typeof errorStore.getState
  setState: typeof errorStore.setState
  subscribe: typeof errorStore.subscribe
} = Object.assign(
  <U>(selector?: (state: ErrorState) => U) => useStore(errorStore, selector!) as U,
  {
    getState: errorStore.getState.bind(errorStore),
    setState: errorStore.setState.bind(errorStore),
    subscribe: errorStore.subscribe.bind(errorStore)
  }
)

export type { ErrorPushInput }
