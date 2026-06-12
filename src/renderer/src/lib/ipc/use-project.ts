import { useCallback } from 'react'
import type { GalideApi } from '../../../../preload'
import { useErrorStore } from '../store'
import type { ProjectManifest } from '../../../../shared/types'
import { useUiStore } from '../store'

declare global {
  interface Window {
    galide: GalideApi
  }
}

const wrap = async <T>(
  source: string,
  fn: () => Promise<T>
): Promise<T | undefined> => {
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

export const useProject = () => {
  const setProject = useUiStore((s) => s.setProject)

  return {
    create: useCallback(
      (name: string) =>
        wrap('project:create', async () => {
          const result = await window.galide.project.create(name)
          if (result.ok && result.projectPath && result.manifest) {
            setProject(result.projectPath, result.manifest)
            await window.galide.project.recordRecent({
              path: result.projectPath,
              name: result.manifest.name
            })
          }
          return result
        }),
      [setProject]
    ),
    open: useCallback(
      () =>
        wrap('project:open', async () => {
          const result = await window.galide.project.open()
          if (result.ok && result.projectPath && result.manifest) {
            setProject(result.projectPath, result.manifest)
            await window.galide.project.recordRecent({
              path: result.projectPath,
              name: result.manifest.name
            })
          }
          return result
        }),
      [setProject]
    ),
    openPath: useCallback(
      (projectPath: string) =>
        wrap('project:openPath', async () => {
          const result = await window.galide.project.openPath(projectPath)
          if (result.ok && result.projectPath && result.manifest) {
            setProject(result.projectPath, result.manifest)
            await window.galide.project.recordRecent({
              path: result.projectPath,
              name: result.manifest.name
            })
          }
          return result
        }),
      [setProject]
    ),
    save: useCallback(
      (projectPath: string, manifest: ProjectManifest) =>
        wrap('project:save', () => window.galide.project.save(projectPath, manifest)),
      []
    ),
    close: useCallback(() => wrap('project:close', () => window.galide.project.close()), []),
    listRecent: useCallback(
      () => wrap('project:listRecent', () => window.galide.project.listRecent()),
      []
    )
  }
}
