/**
 * useWorkspacePersistence — workspace layout 持久化 hook
 *
 * 设计要点:
 *  - 暴露 3 个方法:hydrate / persistProject / persistGlobal。
 *  - 内部走 window.galide.workspace.{readProject,writeProject,readGlobal,writeGlobal},
 *    通过 getGalide() 安全访问器(预 load 未就绪时返回 null,不会 throw)。
 *  - hydrate 优先级:project-level > global > null(由调用方做 merge 兜底)。
 *  - 错误不 throw,统一返回 null 或 no-op(失败不阻断 UI 渲染)。
 *
 * App.tsx 用法:
 *   const persistence = useWorkspacePersistence()
 *   // 启动期 hydrate
 *   void persistence.hydrate(projectPath)
 *   // workspaceLayout 变化 300ms debounce 写盘(由 App.tsx 自己管 timer)
 *   void persistence.persistProject(projectPath, layout)
 *   void persistence.persistGlobal(layout)
 */

import { useCallback } from 'react'
import { getGalide } from './galide-safe'
import type { WorkspaceLayout } from '../../../../shared/workspace-layout'

export type WorkspacePersistence = {
  /**
   * 启动期 hydrate:先读 project 级,失败 / 不存在则回退到 global。
   * projectPath 为 null 时只读 global。
   * 错误不 throw,统一返回 null(merge 容错层会兜底)。
   */
  hydrate: (projectPath: string | null) => Promise<WorkspaceLayout | null>
  /** 写项目级 layout。无 projectPath 时 no-op。 */
  persistProject: (projectPath: string, layout: WorkspaceLayout) => Promise<void>
  /** 写全局 layout。preload 未就绪时静默 no-op。 */
  persistGlobal: (layout: WorkspaceLayout) => Promise<void>
}

export const useWorkspacePersistence = (): WorkspacePersistence => {
  const hydrate = useCallback(async (projectPath: string | null): Promise<WorkspaceLayout | null> => {
    const g = getGalide()
    if (!g?.workspace) return null

    try {
      if (projectPath) {
        const r = await g.workspace.readProject(projectPath)
        if (r?.ok && r.layout) return r.layout
      }
      const g2 = await g.workspace.readGlobal()
      if (g2?.ok && g2.layout) return g2.layout
    } catch {
      // 防御性:即便 safe wrapper 已兜底,这里再 swallow 一次
    }
    return null
  }, [])

  const persistProject = useCallback(
    async (projectPath: string, layout: WorkspaceLayout): Promise<void> => {
      if (!projectPath) return
      const g = getGalide()
      if (!g?.workspace?.writeProject) return
      try {
        await g.workspace.writeProject(projectPath, layout)
      } catch {
        // 静默失败:磁盘写失败不应阻断 UI,后续 300ms 重试
      }
    },
    []
  )

  const persistGlobal = useCallback(async (layout: WorkspaceLayout): Promise<void> => {
    const g = getGalide()
    if (!g?.workspace?.writeGlobal) return
    try {
      await g.workspace.writeGlobal(layout)
    } catch {
      // 静默失败:同上
    }
  }, [])

  return { hydrate, persistProject, persistGlobal }
}