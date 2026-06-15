/**
 * Workspace IPC handler(规约: workspace_layout persistence)
 *
 * 4 个 IPC:
 *  - workspace:readProject  → 读 <projectPath>/.galproj-workspace.json
 *  - workspace:writeProject → 写 <projectPath>/.galproj-workspace.json
 *  - workspace:readGlobal   → 读 userData/galide-workspace.json(electron-store)
 *  - workspace:writeGlobal  → 写 userData/galide-workspace.json(electron-store)
 *
 * 文件路径决策(2026-06-15):
 *  - 项目级:`.galproj` 在 project-handlers.ts 里是 single file(JSON 化的 ProjectManifest,
 *    见 project-handlers.ts:53)。我们用单独的 `.galproj-workspace.json` 与 manifest 区分,
 *    避免合并写时破坏 manifest 字段(写整个 manifest 需 parseManifest 往返 + 字段补齐,
 *    风险大于收益)。
 *  - 全局:用 electron-store(name='galide-workspace',cwd=userData),
 *    与 getStore() 的 'galide-state' 隔离,语义独立。schemaVersion 字段用于未来
 *    upgrade(目前不实现迁移,只在 mergeWorkspaceLayout 容错层兜底)。
 *
 * 错误处理: 不 throw,统一返回 { ok: false, error } 形态(渲染端 hydrate 容错)。
 */

import { app, ipcMain } from 'electron'
import Store from 'electron-store'
import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import { IPC } from '../../shared/ipc-channels.js'
import type { WorkspaceLayout } from '../../shared/workspace-layout.js'

type ReadResult = { ok: true; layout: WorkspaceLayout | null } | { ok: false; error: string }
type WriteResult = { ok: true } | { ok: false; error: string }

const PROJECT_WORKSPACE_FILENAME = '.galproj-workspace.json'

const isWorkspaceLayout = (v: unknown): v is WorkspaceLayout => {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    Array.isArray(o['activeActivity']) &&
    Array.isArray(o['openCenterTabs']) &&
    'rightDock' in o &&
    typeof o['preset'] === 'string' &&
    typeof o['schemaVersion'] === 'number'
  )
}

const readJsonFile = async (filePath: string): Promise<WorkspaceLayout | null> => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (isWorkspaceLayout(parsed)) return parsed
    // 文件存在但不是合法 layout(老版本 / 损坏):返回 null 让上层走 fallback
    return null
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    // 其他错误(parse 失败 / 权限)也走 null(merge 容错层兜底)
    return null
  }
}

const writeJsonFile = async (filePath: string, layout: WorkspaceLayout): Promise<void> => {
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(layout, null, 2), 'utf-8')
}

// 全局 store 单例 — 独立 name,隔离于通用 galide-state store
let globalStore: Store<{ layout: WorkspaceLayout | null }> | null = null

const getGlobalStore = (): Store<{ layout: WorkspaceLayout | null }> => {
  if (globalStore) return globalStore
  globalStore = new Store<{ layout: WorkspaceLayout | null }>({
    name: 'galide-workspace',
    cwd: app.getPath('userData'),
    defaults: { layout: null }
  })
  return globalStore
}

export const registerWorkspaceHandlers = (): void => {
  ipcMain.handle(
    IPC.workspace.readProject,
    async (_e, projectPath: string): Promise<ReadResult> => {
      if (!projectPath || typeof projectPath !== 'string') {
        return { ok: false, error: 'projectPath 必须是非空字符串' }
      }
      const filePath = join(projectPath, PROJECT_WORKSPACE_FILENAME)
      const layout = await readJsonFile(filePath)
      return { ok: true, layout }
    }
  )

  ipcMain.handle(
    IPC.workspace.writeProject,
    async (_e, projectPath: string, layout: WorkspaceLayout): Promise<WriteResult> => {
      if (!projectPath || typeof projectPath !== 'string') {
        return { ok: false, error: 'projectPath 必须是非空字符串' }
      }
      try {
        await writeJsonFile(join(projectPath, PROJECT_WORKSPACE_FILENAME), layout)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(IPC.workspace.readGlobal, async (): Promise<ReadResult> => {
    try {
      const layout = getGlobalStore().get('layout')
      return { ok: true, layout: layout ?? null }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(
    IPC.workspace.writeGlobal,
    async (_e, layout: WorkspaceLayout): Promise<WriteResult> => {
      try {
        getGlobalStore().set('layout', layout)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
}