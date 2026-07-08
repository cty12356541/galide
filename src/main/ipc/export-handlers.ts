import { ipcMain, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { IPC } from '../../shared/ipc-channels.js'
import type { ExportProgress, ExportRequest } from '../../shared/types.js'
import { runExportJob } from '../export/run-export-job.js'
import { ExportCancelSchema, ExportRequestSchema, ipcSchemaFailure, parseIpcArgs } from './schemas/index.js'

/**
 * 规约: layers/main-process/conventions.yaml:34-37
 *   "导出任务入队,避免阻塞;进度通过 IPC RendererEvent 实时推送"
 *   "导出产物写入 exports/ 目录(不在 Git 内)"
 *
 * 任务隔离:每次 export:start 分配 jobId,与 cancel 配套;progress 事件携带 jobId
 * 让 renderer 端能区分多任务/过期事件。
 */

const activeJobs = new Map<string, { cancelled: boolean }>()

export const registerExportHandlers = (): void => {
  ipcMain.handle(
    IPC.export.start,
    async (
      _e,
      req: ExportRequest
    ): Promise<{ ok: boolean; error?: string; code?: string; jobId?: string; paths?: readonly string[] }> => {
      let jobId: string | undefined
      try {
        const validated = parseIpcArgs('export:start', ExportRequestSchema, req)
        const win = BrowserWindow.getFocusedWindow()
        jobId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const job = { cancelled: false }
        activeJobs.set(jobId, job)
        const progress = (p: ExportProgress): void => {
          if (job.cancelled || win?.isDestroyed()) return
          win.webContents.send(IPC.export.progress, { ...p, jobId })
        }
        const result = await runExportJob(validated, {
          fs: {
            readdir: (p) => fs.readdir(p),
            readFile: (p) => fs.readFile(p, 'utf-8'),
            mkdir: (p, o) => fs.mkdir(p, o).then(() => undefined)
          },
          onProgress: progress,
          isCancelled: () => job.cancelled
        })
        activeJobs.delete(jobId)
        if (result.ok === false) return { ok: false, code: result.code, error: result.error }
        return { ok: true, jobId, paths: result.paths }
      } catch (err) {
        const fail = ipcSchemaFailure(err)
        if (fail.code === 'SCHEMA_FAILED') return fail
        if (jobId) activeJobs.delete(jobId)
        const message = err instanceof Error ? err.message : String(err)
        const code = (err as { code?: string }).code
        return { ok: false, error: message, ...(code ? { code } : {}) }
      }
    }
  )

  ipcMain.handle(
    IPC.export.cancel,
    async (_e, jobId: string): Promise<{ ok: boolean; cancelled: boolean; error?: string; code?: string }> => {
      try {
        const args = parseIpcArgs('export:cancel', ExportCancelSchema, { jobId })
        const job = activeJobs.get(args.jobId)
        if (!job) return { ok: false, cancelled: false }
        job.cancelled = true
        activeJobs.delete(args.jobId)
        return { ok: true, cancelled: true }
      } catch (err) {
        return { ...ipcSchemaFailure(err), cancelled: false }
      }
    }
  )
}
