import { ipcMain, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { IPC } from '../../shared/ipc-channels.js'
import { scriptsDirAbs } from '../../shared/project-layout.js'
import type { ExportProgress, ExportRequest } from '../../shared/types.js'
import {
  getExportComposer,
  runComposer,
  type ExportContext
} from '../export/index.js'
import {
  assertExportableScripts,
  parseProjectScripts
} from '../export/parse-project-scripts.js'
import { countScenesInAsts } from '../export/shared.js'
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
        const composer = getExportComposer(validated.target)
        if (!composer) {
          activeJobs.delete(jobId)
          return { ok: false, code: 'UNKNOWN_TARGET', error: `Unknown export target: ${validated.target}` }
        }
        const scriptsDir = scriptsDirAbs(validated.projectPath)
        progress({ stage: 'parse', progress: 0, message: 'Scanning scripts...' })
        const { asts, failures } = await parseProjectScripts(scriptsDir, {
          readdir: (p) => fs.readdir(p),
          readFile: (p) => fs.readFile(p, 'utf-8')
        })
        const galFileCount = asts.length + failures.length
        progress({
          stage: 'parse',
          progress: 0.2,
          message: `Found ${galFileCount} scripts`
        })
        if (job.cancelled) {
          activeJobs.delete(jobId)
          return { ok: false, code: 'CANCELLED', error: 'export cancelled' }
        }
        assertExportableScripts(asts, failures, galFileCount)
        if (countScenesInAsts(asts) === 0) {
          progress({
            stage: 'parse',
            progress: 0.25,
            message: 'Warning: no scenes; exported runtime will end immediately'
          })
        }
        for (let i = 0; i < asts.length; i++) {
          progress({
            stage: 'parse',
            progress: 0.2 + (0.3 * (i + 1)) / asts.length,
            message: `Parsed ${asts[i]?.file ?? ''}`
          })
        }
        progress({ stage: 'transform', progress: 0.5, message: 'Transforming...' })
        progress({ stage: 'emit', progress: 0.8, message: 'Emitting target files...' })
        await fs.mkdir(validated.outputPath, { recursive: true })
        const ctx: ExportContext = {
          request: validated,
          asts,
          outputDir: validated.outputPath,
          progress
        }
        const { paths } = await runComposer(composer, ctx)
        progress({
          stage: 'done',
          progress: 1,
          message: `Export complete: ${paths.length} files written to ${validated.outputPath}`
        })
        activeJobs.delete(jobId)
        return { ok: true, jobId, paths }
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
