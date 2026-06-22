/**
 * Git IPC 薄壳(规约: layers/main-process/conventions.yaml:28-32)
 * 实际逻辑在 ../git/git-service.ts,handler 只做 IPC 转发。
 */
import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'
import { gitService } from '../git/git-service.js'
import type { GitStatus, GitCommit } from '../git/git-service.js'
import {
  GitCommitSchema,
  GitDiffSchema,
  GitGetRemotesSchema,
  GitInitSchema,
  GitLogSchema,
  GitPushPullSchema,
  GitSetRemoteSchema,
  GitStatusSchema,
  ipcSchemaFailure,
  parseIpcArgs
} from './schemas/index.js'

export const registerGitHandlers = (): void => {
  ipcMain.handle(IPC.git.init, async (_e, projectPath: string): Promise<{ ok: boolean; error?: string; code?: string }> => {
    try {
      const args = parseIpcArgs('git:init', GitInitSchema, { projectPath })
      const r = await gitService.init(args.projectPath)
      return { ok: r.ok }
    } catch (err) {
      return ipcSchemaFailure(err)
    }
  })

  ipcMain.handle(IPC.git.status, async (_e, projectPath: string): Promise<GitStatus | { ok: false; error: string; code: 'SCHEMA_FAILED' }> => {
    try {
      const args = parseIpcArgs('git:status', GitStatusSchema, { projectPath })
      const r = await gitService.status(args.projectPath)
      if (r.ok) return r.value
      return { initialized: false, current: null, files: [] }
    } catch (err) {
      return ipcSchemaFailure(err)
    }
  })

  ipcMain.handle(
    IPC.git.commit,
    async (_e, projectPath: string, message: string, files?: string[]): Promise<{ ok: boolean; error?: string; code?: string }> => {
      try {
        const args = parseIpcArgs('git:commit', GitCommitSchema, { projectPath, message, files })
        const r = await gitService.addAndCommit(args.projectPath, args.files ?? [], args.message)
        return { ok: r.ok }
      } catch (err) {
        return ipcSchemaFailure(err)
      }
    }
  )

  ipcMain.handle(
    IPC.git.log,
    async (_e, projectPath: string): Promise<GitCommit[] | { ok: false; error: string; code: 'SCHEMA_FAILED' }> => {
      try {
        const args = parseIpcArgs('git:log', GitLogSchema, { projectPath })
        const r = await gitService.log(args.projectPath)
        if (r.ok) return r.value
        return []
      } catch (err) {
        return ipcSchemaFailure(err)
      }
    }
  )

  ipcMain.handle(
    IPC.git.diff,
    async (_e, projectPath: string, filePath: string): Promise<string | { ok: false; error: string; code: 'SCHEMA_FAILED' }> => {
      try {
        const args = parseIpcArgs('git:diff', GitDiffSchema, { projectPath, filePath })
        const r = await gitService.diff(args.projectPath, args.filePath)
        if (r.ok) return r.value
        return ''
      } catch (err) {
        return ipcSchemaFailure(err)
      }
    }
  )

  ipcMain.handle(
    IPC.git.getRemotes,
    async (_e, projectPath: string): Promise<{ ok: boolean; remotes?: { name: string; url: string }[]; error?: string; code?: string }> => {
      try {
        const args = parseIpcArgs('git:getRemotes', GitGetRemotesSchema, { projectPath })
        const r = await gitService.getRemotes(args.projectPath)
        if (r.ok !== true) return { ok: false, error: r.error.message }
        return { ok: true, remotes: r.value }
      } catch (err) {
        return ipcSchemaFailure(err)
      }
    }
  )

  ipcMain.handle(
    IPC.git.setRemote,
    async (_e, projectPath: string, url: string): Promise<{ ok: boolean; error?: string; code?: string }> => {
      try {
        const args = parseIpcArgs('git:setRemote', GitSetRemoteSchema, { projectPath, url })
        const r = await gitService.setRemote(args.projectPath, args.url)
        if (r.ok !== true) return { ok: false, error: r.error.message, code: r.error.code }
        return { ok: true }
      } catch (err) {
        return ipcSchemaFailure(err)
      }
    }
  )

  ipcMain.handle(
    IPC.git.push,
    async (_e, projectPath: string): Promise<{ ok: boolean; error?: string; code?: string }> => {
      try {
        const args = parseIpcArgs('git:push', GitPushPullSchema, { projectPath })
        const r = await gitService.push(args.projectPath)
        if (r.ok !== true) return { ok: false, error: r.error.message, code: r.error.code }
        return { ok: true }
      } catch (err) {
        return ipcSchemaFailure(err)
      }
    }
  )

  ipcMain.handle(
    IPC.git.pull,
    async (_e, projectPath: string): Promise<{ ok: boolean; error?: string; code?: string }> => {
      try {
        const args = parseIpcArgs('git:pull', GitPushPullSchema, { projectPath })
        const r = await gitService.pull(args.projectPath)
        if (r.ok !== true) return { ok: false, error: r.error.message, code: r.error.code }
        return { ok: true }
      } catch (err) {
        return ipcSchemaFailure(err)
      }
    }
  )
}
