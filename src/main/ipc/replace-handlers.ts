/**
 * replace-handlers — script:replacePreview / replaceApply / replaceRollback 薄壳
 *
 * 与 script-handlers 同约定:schema 校验 → service 编排 → 结构化 Result 返回。
 * apply 成功后对变更文件广播 script:changed(排除发送者窗口),
 * 与其他写盘路径(editor write / agent)行为一致。
 */
import { ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { IPC } from '../../shared/ipc-channels.js'
import { gitService } from '../git/git-service.js'
import { broadcastScriptChanged } from './script-broadcast.js'
import {
  applyScriptReplace,
  previewScriptReplace,
  rollbackScriptReplace,
  type ReplaceFs,
  type ReplaceGit
} from './replace-service.js'
import {
  ipcSchemaFailure,
  parseIpcArgs,
  ScriptReplaceApplySchema,
  ScriptReplacePreviewSchema,
  ScriptReplaceRollbackSchema
} from './schemas/index.js'

const fsAdapter: ReplaceFs = {
  readFile: (path) => fs.readFile(path, 'utf-8'),
  writeFile: (path, content) => fs.writeFile(path, content, 'utf-8'),
  readDir: (path) => fs.readdir(path)
}

const gitAdapter: ReplaceGit = {
  snapshot: (projectPath, label) => gitService.snapshot(projectPath, label),
  resetHard: (projectPath, ref) => gitService.resetHard(projectPath, ref)
}

export const registerReplaceHandlers = (): void => {
  ipcMain.handle(IPC.script.replacePreview, async (_e, req: unknown) => {
    try {
      const args = parseIpcArgs('script:replacePreview', ScriptReplacePreviewSchema, req)
      const r = await previewScriptReplace(args.projectPath, args, { fs: fsAdapter })
      if (r.ok !== true) return { ok: false as const, code: r.error.code, error: r.error.message }
      return { ok: true as const, matches: r.value.matches, truncated: r.value.truncated }
    } catch (err) {
      const fail = ipcSchemaFailure(err)
      if (fail.code === 'SCHEMA_FAILED') return fail
      throw err
    }
  })

  ipcMain.handle(IPC.script.replaceApply, async (e, req: unknown) => {
    try {
      const args = parseIpcArgs('script:replaceApply', ScriptReplaceApplySchema, req)
      const r = await applyScriptReplace(args.projectPath, args.replacement, args.matches, {
        fs: fsAdapter,
        git: gitAdapter
      })
      if (r.ok !== true) {
        return {
          ok: false as const,
          code: r.error.code,
          error: r.error.message,
          ...(r.error.snapshotRef !== undefined ? { snapshotRef: r.error.snapshotRef } : {})
        }
      }
      for (const changed of r.value.filesChanged) {
        broadcastScriptChanged(
          { projectPath: args.projectPath, fileName: changed.file, source: changed.content },
          { excludeSenderId: e.sender.id }
        )
      }
      return {
        ok: true as const,
        applied: r.value.applied,
        conflicts: r.value.conflicts,
        filesChanged: r.value.filesChanged.map((f) => f.file),
        snapshotRef: r.value.snapshotRef
      }
    } catch (err) {
      const fail = ipcSchemaFailure(err)
      if (fail.code === 'SCHEMA_FAILED') return fail
      throw err
    }
  })

  ipcMain.handle(IPC.script.replaceRollback, async (_e, req: unknown) => {
    try {
      const args = parseIpcArgs('script:replaceRollback', ScriptReplaceRollbackSchema, req)
      const r = await rollbackScriptReplace(args.projectPath, args.snapshotRef, { git: gitAdapter })
      if (r.ok !== true) return { ok: false as const, code: r.error.code, error: r.error.message }
      return { ok: true as const }
    } catch (err) {
      const fail = ipcSchemaFailure(err)
      if (fail.code === 'SCHEMA_FAILED') return fail
      throw err
    }
  })
}
