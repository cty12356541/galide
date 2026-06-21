/**
 * Git IPC 薄壳(规约: layers/main-process/conventions.yaml:28-32)
 * 实际逻辑在 ../git/git-service.ts,handler 只做 IPC 转发。
 */
import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'
import { gitService } from '../git/git-service.js'
import type { GitStatus, GitCommit } from '../git/git-service.js'

export const registerGitHandlers = (): void => {
  ipcMain.handle(IPC.git.init, async (_e, projectPath: string): Promise<{ ok: boolean }> => {
    const r = await gitService.init(projectPath)
    return { ok: r.ok }
  })

  ipcMain.handle(IPC.git.status, async (_e, projectPath: string): Promise<GitStatus> => {
    const r = await gitService.status(projectPath)
    if (r.ok) return r.value
    return { initialized: false, current: null, files: [] }
  })

  ipcMain.handle(
    IPC.git.commit,
    async (_e, projectPath: string, message: string, files?: string[]): Promise<{ ok: boolean }> => {
      // files 为空数组或 undefined → add('.') 全部暂存;指定文件 → 只暂存选中
      const r = await gitService.addAndCommit(projectPath, files ?? [], message)
      return { ok: r.ok }
    }
  )

  ipcMain.handle(IPC.git.log, async (_e, projectPath: string): Promise<GitCommit[]> => {
    const r = await gitService.log(projectPath)
    if (r.ok) return r.value
    return []
  })

  ipcMain.handle(
    IPC.git.diff,
    async (_e, projectPath: string, filePath: string): Promise<string> => {
      const r = await gitService.diff(projectPath, filePath)
      if (r.ok) return r.value
      return ''
    }
  )
}
