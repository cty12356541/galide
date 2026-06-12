import { ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '../../shared/ipc-channels.js'
import { parse } from '../../shared/dsl/parser.js'
import type { Result, ScriptNode, ParseError } from '../../shared/dsl/types.js'
import { gitService } from '../git/git-service.js'
import { getPreference } from '../preferences/preferences-store.js'

export const registerScriptHandlers = (): void => {
  ipcMain.handle(
    IPC.script.read,
    async (_e, projectPath: string, fileName: string): Promise<string> => {
      const content = await fs.readFile(join(projectPath, 'scripts', fileName), 'utf-8')
      return content
    }
  )

  ipcMain.handle(
    IPC.script.write,
    async (_e, projectPath: string, fileName: string, content: string): Promise<void> => {
      await fs.writeFile(join(projectPath, 'scripts', fileName), content, 'utf-8')
      // 自动 commit(规约 core/conventions.yaml:28;preferences.git.autoCommitOnSave)
      const gitPrefs = getPreference('git')
      if (gitPrefs.autoCommitOnSave) {
        const relPath = join('scripts', fileName)
        await gitService.addAndCommit(projectPath, [relPath], `update: ${fileName}`)
      }
    }
  )

  ipcMain.handle(
    IPC.script.parse,
    async (_e, source: string): Promise<Result<ScriptNode, ParseError[]>> => {
      return parse(source)
    }
  )

  ipcMain.handle(IPC.script.list, async (_e, projectPath: string): Promise<string[]> => {
    const dir = join(projectPath, 'scripts')
    try {
      const files = await fs.readdir(dir)
      return files.filter((f) => f.endsWith('.gal'))
    } catch (err) {
      // P1-6 修复: 区分 ENOENT(项目刚建,正常)与真实 IO 错误
      const isNotFound =
        err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT'
      if (!isNotFound) {
        console.warn(`[galide script] 列出 ${dir} 失败`, err)
      }
      return []
    }
  })
}
