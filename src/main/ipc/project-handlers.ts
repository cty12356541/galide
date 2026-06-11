import { ipcMain, dialog, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '../../shared/ipc-channels.js'
import type { ProjectManifest, ProjectOpenResult } from '../../shared/types'
import { getStore } from '../store/store.js'
import { gitService } from '../git/git-service.js'
import { getPreference } from '../preferences/preferences-store.js'

const ensureProjectLayout = async (projectPath: string): Promise<void> => {
  await fs.mkdir(join(projectPath, 'scripts'), { recursive: true })
  await fs.mkdir(join(projectPath, 'assets', 'characters'), { recursive: true })
  await fs.mkdir(join(projectPath, 'assets', 'backgrounds'), { recursive: true })
  await fs.mkdir(join(projectPath, 'assets', 'bgm'), { recursive: true })
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

const readManifest = async (projectPath: string): Promise<ProjectManifest> => {
  const raw = await fs.readFile(join(projectPath, '.galproj'), 'utf-8')
  return JSON.parse(raw) as ProjectManifest
}

const writeManifest = async (projectPath: string, manifest: ProjectManifest): Promise<void> => {
  await fs.writeFile(join(projectPath, '.galproj'), JSON.stringify(manifest, null, 2))
}

export const registerProjectHandlers = (): void => {
  ipcMain.handle(IPC.project.create, async (_e, name: string): Promise<ProjectOpenResult> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { ok: false, error: 'No focused window' }
    const result = await dialog.showOpenDialog(win, {
      title: '选择项目目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, error: 'canceled' }
    }
    const projectPath = result.filePaths[0]!
    await ensureProjectLayout(projectPath)
    const manifest: ProjectManifest = {
      version: '0.1.0',
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      characters: [],
      assets: {
        characters: 'assets/characters',
        backgrounds: 'assets/backgrounds',
        bgm: 'assets/bgm'
      },
      git: { initialized: false }
    }
    await writeManifest(projectPath, manifest)
    await fs.writeFile(join(projectPath, 'scripts', 'chapter1.gal'), '', 'utf-8')

    // 自动 git init + initial commit(规约 core/conventions.yaml:24-31)
    const gitPrefs = getPreference('git')
    if (gitPrefs.autoInit) {
      const initRes = await gitService.init(projectPath)
      if (initRes.ok) {
        await gitService.createInitialCommit(projectPath, gitPrefs.initialCommitMessage)
        manifest.git = { initialized: true }
        await writeManifest(projectPath, manifest)
      }
    }

    return { ok: true, projectPath, manifest }
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
