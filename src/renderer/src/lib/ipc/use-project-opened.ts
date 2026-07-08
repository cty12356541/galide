/**
 * use-project-opened — agent open_project 后同步 UI store
 */
import { useEffect } from 'react'
import { useUiStore } from '../store'
import { getGalide } from './galide-safe.js'

export const useProjectOpened = (): void => {
  useEffect(() => {
    const g = getGalide()
    if (!g?.project?.onOpened) return
    const off = g.project.onOpened(({ projectPath, manifest }) => {
      useUiStore.getState().setProject(projectPath, manifest)
    })
    return off
  }, [])
}
