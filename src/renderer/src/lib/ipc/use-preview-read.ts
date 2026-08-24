/**
 * use-preview-read — 全局已读记录 IPC 封装(.galide/read-state.json)
 */
import { useCallback, useEffect, useState } from 'react'
import type { VmReadState } from '../../../../shared/preview/runtime-vm'

const g = (): typeof window.galide => window.galide

export const usePreviewRead = (projectPath: string | null) => {
  const [readState, setReadState] = useState<VmReadState>({ readLineIds: [] })

  useEffect(() => {
    if (!projectPath) return
    let cancelled = false
    void (async () => {
      const r = await g().preview.loadReadState(projectPath)
      if (!cancelled) setReadState(r)
    })()
    return () => {
      cancelled = true
    }
  }, [projectPath])

  const saveReadState = useCallback(
    async (next: VmReadState): Promise<void> => {
      if (!projectPath) return
      await g().preview.saveReadState(projectPath, next)
    },
    [projectPath]
  )

  return { readState, saveReadState }
}
