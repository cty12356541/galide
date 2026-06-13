import { ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '../../shared/ipc-channels.js'
import { parse } from '../../shared/dsl/parser.js'
import type { Result, ScriptNode, ParseError } from '../../shared/dsl/types.js'
import { gitService } from '../git/git-service.js'
import { getPreference } from '../preferences/preferences-store.js'
import {
  readScript,
  writeScript,
  listScripts,
  type ScriptFs,
  type ScriptGit
} from './script-service.js'

/**
 * P1 修复:
 * - 把 fs / git 依赖通过接口注入 service,本文件只做 IPC 薄壳。
 * - service 层已含 fileName 白名单 + write/commit 错误处理。
 */
const fsAdapter: ScriptFs = {
  readFile: (path) => fs.readFile(path, 'utf-8'),
  writeFile: (path, content) => fs.writeFile(path, content, 'utf-8'),
  readDir: (path) => fs.readdir(path)
}

const gitAdapter: ScriptGit = {
  addAndCommit: (projectPath, files, message) => gitService.addAndCommit(projectPath, files, message)
}

export const registerScriptHandlers = (): void => {
  ipcMain.handle(
    IPC.script.read,
    async (_e, projectPath: string, fileName: string): Promise<string> => {
      const r = await readScript(projectPath, fileName, { fs: fsAdapter })
      if (r.ok !== true) throw new Error(r.error.message)
      return r.value
    }
  )

  ipcMain.handle(
    IPC.script.write,
    async (
      _e,
      projectPath: string,
      fileName: string,
      content: string
    ): Promise<{ ok: boolean; error?: string; code?: string }> => {
      const r = await writeScript(projectPath, fileName, content, {
        fs: fsAdapter,
        git: gitAdapter,
        gitPrefs: getPreference('git')
      })
      if (r.ok !== true) return { ok: false, error: r.error.message, code: r.error.code }
      return { ok: true }
    }
  )

  ipcMain.handle(
    IPC.script.parse,
    async (_e, source: string): Promise<Result<ScriptNode, ParseError[]>> => {
      return parse(source)
    }
  )

  ipcMain.handle(IPC.script.list, async (_e, projectPath: string): Promise<string[]> => {
    const r = await listScripts(projectPath, { fs: fsAdapter })
    if (r.ok !== true) {
      console.warn(`[galide script] 列出 ${join(projectPath, 'scripts')} 失败: ${r.error.message}`)
      return []
    }
    return r.value
  })
}
