import { ipcMain, dialog, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '../../shared/ipc-channels.js'
import type { ProjectManifest, ProjectOpenResult } from '../../shared/types.js'
import { getStore } from '../store/store.js'
import { gitService } from '../git/git-service.js'
import { getPreference } from '../preferences/preferences-store.js'
import { parseManifest } from '../../shared/manifest-schema.js'
import {
  createProject,
  type ProjectFs,
  type ProjectGit,
  type ProjectDialog
} from './project-service.js'

/**
 * P1 修复:
 * - git init/commit 失败时回滚 .git + manifest.git 标记正确
 * - name 走 sanitize(trim + 长度上限 + 控制字符过滤)
 * - 写操作通过 project-service,本文件做 IPC 薄壳 + legacy read/save 兼容
 */
const fsAdapter: ProjectFs = {
  mkdir: (path, opts) => fs.mkdir(path, opts).then(() => undefined),
  writeFile: (path, content) => fs.writeFile(path, content, 'utf-8'),
  readFile: (path) => fs.readFile(path, 'utf-8'),
  rm: (path, opts) => fs.rm(path, opts),
  exists: async (path) => {
    try {
      await fs.access(path)
      return true
    } catch {
      return false
    }
  }
}

const gitAdapter: ProjectGit = {
  init: (projectPath) => gitService.init(projectPath),
  createInitialCommit: (projectPath, message) => gitService.createInitialCommit(projectPath, message)
}

const readManifest = async (projectPath: string): Promise<ProjectManifest> => {
  const raw = await fs.readFile(join(projectPath, '.galproj'), 'utf-8')
  const r = parseManifest(raw)
  if (r.ok !== true) {
    throw new Error(`[galide] 打开项目失败: ${r.error.message}`)
  }
  return r.value
}

const writeManifest = async (projectPath: string, manifest: ProjectManifest): Promise<void> => {
  await fs.writeFile(join(projectPath, '.galproj'), JSON.stringify(manifest, null, 2))
}

const openProjectAtPath = async (projectPath: string): Promise<ProjectOpenResult> => {
  try {
    const manifest = await readManifest(projectPath)
    return { ok: true, projectPath, manifest }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}

export const registerProjectHandlers = (): void => {
  ipcMain.handle(IPC.project.create, async (_e, name: string): Promise<ProjectOpenResult> => {
    const win = BrowserWindow.getFocusedWindow()
    const dialogAdapter: ProjectDialog = {
      showOpenDialog: async () => {
        if (!win) return { canceled: true, filePaths: [] }
        const result = await dialog.showOpenDialog(win, {
          title: '选择项目目录',
          properties: ['openDirectory', 'createDirectory']
        })
        return { canceled: result.canceled, filePaths: result.filePaths }
      }
    }
    const r = await createProject(name, {
      fs: fsAdapter,
      git: gitAdapter,
      dialog: dialogAdapter,
      gitPrefs: getPreference('git')
    })
    if (r.ok === true) {
      return { ok: true, projectPath: r.value.projectPath, manifest: r.value.manifest }
    }
    return { ok: false, error: r.error.message }
  })

  ipcMain.handle(IPC.project.open, async (): Promise<ProjectOpenResult> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { ok: false, error: 'No focused window' }
    const result = await dialog.showOpenDialog(win, {
      title: '打开项目',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, error: 'canceled' }
    }
    const projectPath = result.filePaths[0]!
    return openProjectAtPath(projectPath)
  })

  ipcMain.handle(IPC.project.openPath, async (_e, projectPath: string): Promise<ProjectOpenResult> => {
    return openProjectAtPath(projectPath)
  })

  ipcMain.handle(
    IPC.project.save,
    async (_e, projectPath: string, manifest: ProjectManifest): Promise<ProjectOpenResult> => {
      try {
        manifest.updatedAt = new Date().toISOString()
        await writeManifest(projectPath, manifest)
        return { ok: true, manifest }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false, error: message }
      }
    }
  )

  ipcMain.handle(IPC.project.close, async (): Promise<{ ok: true }> => {
    return { ok: true }
  })

  ipcMain.handle(
    IPC.project.recent,
    async (_e, entry: { path: string; name: string }): Promise<{ ok: boolean }> => {
      const store = getStore()
      const items = (store.get('recentProjects') as { path: string; name: string; lastOpened: string }[] | undefined) ?? []
      const filtered = items.filter((i) => i.path !== entry.path)
      filtered.unshift({ ...entry, lastOpened: new Date().toISOString() })
      store.set('recentProjects', filtered.slice(0, 10))
      return { ok: true }
    }
  )

  ipcMain.handle(IPC.project.listRecent, async () => {
    const store = getStore()
    const items = (store.get('recentProjects') as { path: string; name: string; lastOpened: string }[] | undefined) ?? []
    return { ok: true, items }
  })
}
