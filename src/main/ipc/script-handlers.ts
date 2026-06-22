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
import { scriptsDirAbs } from '../../shared/project-layout.js'
import { mergeScriptAsts } from '../../shared/dsl/merge-scripts.js'
import {
  assertExportableScripts,
  parseProjectScripts
} from '../export/parse-project-scripts.js'
import { ExportError } from '../export/composer.js'
import { broadcastScriptChanged } from './script-broadcast.js'
import {
  ipcSchemaFailure,
  parseIpcArgs,
  ScriptListSchema,
  ScriptParseProjectSchema,
  ScriptParseSchema,
  ScriptReadSchema,
  ScriptSearchProjectSchema,
  ScriptWriteSchema
} from './schemas/index.js'
import { searchProjectScripts } from '../../shared/dsl/search-project-scripts.js'

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
      try {
        const args = parseIpcArgs('script:read', ScriptReadSchema, { projectPath, fileName })
        const r = await readScript(args.projectPath, args.fileName, { fs: fsAdapter })
        if (r.ok !== true) throw new Error(r.error.message)
        return r.value
      } catch (err) {
        const fail = ipcSchemaFailure(err)
        if (fail.code === 'SCHEMA_FAILED') throw new Error(fail.error)
        throw err
      }
    }
  )

  ipcMain.handle(
    IPC.script.write,
    async (
      e,
      projectPath: string,
      fileName: string,
      content: string
    ): Promise<{ ok: boolean; error?: string; code?: string }> => {
      try {
        const args = parseIpcArgs('script:write', ScriptWriteSchema, { projectPath, fileName, content })
        const r = await writeScript(args.projectPath, args.fileName, args.content, {
          fs: fsAdapter,
          git: gitAdapter,
          gitPrefs: getPreference('git')
        })
        if (r.ok !== true) return { ok: false, error: r.error.message, code: r.error.code }
        broadcastScriptChanged(
          { projectPath: args.projectPath, fileName: args.fileName, source: args.content },
          { excludeSenderId: e.sender.id }
        )
        return { ok: true }
      } catch (err) {
        const fail = ipcSchemaFailure(err)
        if (fail.code === 'SCHEMA_FAILED') return fail
        throw err
      }
    }
  )

  ipcMain.handle(
    IPC.script.parse,
    async (_e, source: string): Promise<Result<ScriptNode, ParseError[]>> => {
      try {
        const args = parseIpcArgs('script:parse', ScriptParseSchema, { source })
        return parse(args.source)
      } catch (err) {
        const fail = ipcSchemaFailure(err)
        if (fail.code === 'SCHEMA_FAILED') throw new Error(fail.error)
        throw err
      }
    }
  )

  ipcMain.handle(IPC.script.list, async (_e, projectPath: string): Promise<string[]> => {
    try {
      const args = parseIpcArgs('script:list', ScriptListSchema, { projectPath })
      const r = await listScripts(args.projectPath, { fs: fsAdapter })
      if (r.ok !== true) {
        console.warn(`[galide script] 列出 ${join(args.projectPath, 'scripts')} 失败: ${r.error.message}`)
        return []
      }
      return r.value
    } catch (err) {
      const fail = ipcSchemaFailure(err)
      if (fail.code === 'SCHEMA_FAILED') {
        console.warn(`[galide script] list schema failed: ${fail.error}`)
        return []
      }
      throw err
    }
  })

  ipcMain.handle(IPC.script.parseProject, async (_e, projectPath: string) => {
    try {
      const args = parseIpcArgs('script:parseProject', ScriptParseProjectSchema, { projectPath })
      const scriptsDir = scriptsDirAbs(args.projectPath)
      const { asts, failures } = await parseProjectScripts(scriptsDir, {
        readdir: (p) => fs.readdir(p),
        readFile: (p) => fs.readFile(p, 'utf-8')
      })
      const galFileCount = asts.length + failures.length
      try {
        assertExportableScripts(asts, failures, galFileCount)
      } catch (e) {
        if (e instanceof ExportError) {
          return { ok: false, code: e.code, error: e.message }
        }
        throw e
      }
      return { ok: true, mergedAst: mergeScriptAsts(asts) }
    } catch (err) {
      const fail = ipcSchemaFailure(err)
      if (fail.code === 'SCHEMA_FAILED') return fail
      throw err
    }
  })

  ipcMain.handle(IPC.script.searchProject, async (_e, projectPath: string, query: string) => {
    try {
      const args = parseIpcArgs('script:searchProject', ScriptSearchProjectSchema, {
        projectPath,
        query
      })
      const hits = await searchProjectScripts(scriptsDirAbs(args.projectPath), args.query, {
        readdir: (p) => fs.readdir(p),
        readFile: (p) => fs.readFile(p, 'utf-8')
      })
      return { ok: true as const, hits }
    } catch (err) {
      const fail = ipcSchemaFailure(err)
      if (fail.code === 'SCHEMA_FAILED') return fail
      throw err
    }
  })
}
