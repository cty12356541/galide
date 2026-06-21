import { useCallback } from 'react'
import { useErrorStore } from '../store'

export const useGit = () => {
  return {
    init: useCallback(
      (projectPath: string) => wrap('git:init', () => window.galide.git.init(projectPath)),
      []
    ),
    status: useCallback(
      (projectPath: string) => wrap('git:status', () => window.galide.git.status(projectPath)),
      []
    ),
    commit: useCallback(
      (projectPath: string, message: string, files?: string[]) =>
        wrap('git:commit', () => window.galide.git.commit(projectPath, message, files)),
      []
    ),
    log: useCallback(
      (projectPath: string) => wrap('git:log', () => window.galide.git.log(projectPath)),
      []
    ),
    diff: useCallback(
      (projectPath: string, filePath: string) =>
        wrap('git:diff', () => window.galide.git.diff(projectPath, filePath)),
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
