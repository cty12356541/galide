import { useCallback } from 'react'
import { useErrorStore } from '../store'

export const useExport = () => {
  return {
    start: useCallback(
      (req: { projectPath: string; target: string; outputPath: string }) =>
        wrap('export:start', () => window.galide.export.start(req)),
      []
    ),
    cancel: useCallback(
      (jobId: string) => wrap('export:cancel', () => window.galide.export.cancel(jobId)),
      []
    ),
    onProgress: useCallback(
      (
        callback: (progress: {
          stage: string
          progress: number
          message: string
          jobId?: string
        }) => void
      ) => window.galide.export.onProgress(callback),
      []
    ),
    chooseDirectory: useCallback(
      (opts?: { title?: string; defaultPath?: string }) =>
        wrap('dialog:chooseDirectory', () => window.galide.dialog.chooseDirectory(opts)),
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
