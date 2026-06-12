import { useCallback } from 'react'
import { useErrorStore } from '../store'

export const useStore = () => {
  return {
    get: useCallback(
      <T = unknown>(key: string) => wrap(`store:get:${key}`, () => window.galide.store.get<T>(key)),
      []
    ),
    set: useCallback(
      <T = unknown>(key: string, value: T) =>
        wrap(`store:set:${key}`, () => window.galide.store.set<T>(key, value)),
      []
    )
  }
}

const wrap = async <T>(source: string, fn: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await fn()
  } catch (err) {
    useErrorStore.getState().push({
      code: 'IPC_ERROR',
      message: err instanceof Error ? err.message : String(err),
      source
    })
    return undefined
  }
}
