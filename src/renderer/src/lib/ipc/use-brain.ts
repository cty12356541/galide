import { useCallback } from 'react'
import { useErrorStore } from '../store'
import type { ProjectBrain } from '../../../../shared/brain/schema'

export type BrainListResult = {
  ok: boolean
  brain?: ProjectBrain
  invalid?: boolean
  error?: string
}

export const useBrain = () => {
  return {
    list: useCallback(
      (projectPath: string): Promise<BrainListResult | undefined> =>
        wrap('brain:list', () => window.galide.brain.list(projectPath)),
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
      source,
      message: err instanceof Error ? err.message : String(err)
    })
    return undefined
  }
}
