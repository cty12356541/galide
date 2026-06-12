import { useCallback, useEffect } from 'react'
import { useUiStore } from '../store'
import { useProject } from './use-project'

/**
 * 最近项目列表 + 直接打开 hook
 * 规约: shared UI state → Zustand, IPC 走 hook
 */
export const useRecentProjects = () => {
  const recent = useUiStore((s) => s.recentProjects)
  const setRecent = useUiStore((s) => s.setRecentProjects)
  const project = useProject()

  const refresh = useCallback(async () => {
    const result = await window.galide.project.listRecent()
    if (result.ok && result.items) {
      setRecent(result.items)
    }
  }, [setRecent])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openRecent = useCallback(
    async (path: string) => {
      return project.openPath(path)
    },
    [project]
  )

  return { recent, refresh, openRecent }
}
