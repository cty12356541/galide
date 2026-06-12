import { ipcMain, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '../../shared/ipc-channels.js'
import { parse } from '../../shared/dsl/parser.js'
import type { ScriptNode } from '../../shared/dsl/types.js'
import type { ExportProgress, ExportRequest } from '../../shared/types.js'
import {
  getExportComposer,
  runComposer,
  type AstEntry,
  type ExportContext
} from '../export/index.js'

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
      const win = BrowserWindow.getFocusedWindow()
      const jobId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const job = { cancelled: false }
      activeJobs.set(jobId, job)
      const progress = (p: ExportProgress): void => {
        if (job.cancelled || win?.isDestroyed()) return
        win.webContents.send(IPC.export.progress, { ...p, jobId })
      }
      try {
        const composer = getExportComposer(req.target)
        if (!composer) {
          activeJobs.delete(jobId)
          return { ok: false, code: 'UNKNOWN_TARGET', error: `Unknown export target: ${req.target}` }
        }
        const scriptsDir = join(req.projectPath, 'scripts')
        const files = await fs.readdir(scriptsDir)
        const galFiles = files.filter((f) => f.endsWith('.gal'))
        progress({
          stage: 'parse',
          progress: 0,
          message: `Found ${galFiles.length} scripts`
        })
        const asts: AstEntry[] = []
        let i = 0
        for (const file of galFiles) {
          if (job.cancelled) {
            activeJobs.delete(jobId)
            return { ok: false, code: 'CANCELLED', error: 'export cancelled' }
          }
          const content = await fs.readFile(join(scriptsDir, file), 'utf-8')
          const result = parse(content)
          if (result.ok) {
            const ast: ScriptNode = result.value
            asts.push({ file, ast })
          }
          i++
          progress({ stage: 'parse', progress: i / galFiles.length, message: `Parsed ${file}` })
        }
        progress({ stage: 'transform', progress: 0.5, message: 'Transforming...' })
        progress({ stage: 'emit', progress: 0.8, message: 'Emitting target files...' })
        await fs.mkdir(req.outputPath, { recursive: true })
        const ctx: ExportContext = {
          request: req,
          asts,
          outputDir: req.outputPath,
          progress
        }
        const { paths } = await runComposer(composer, ctx)
        progress({
          stage: 'done',
          progress: 1,
          message: `Export complete: ${paths.length} files written to ${req.outputPath}`
        })
        activeJobs.delete(jobId)
        return { ok: true, jobId, paths }
      } catch (err) {
        activeJobs.delete(jobId)
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false, error: message }
      }
    }
  )

  ipcMain.handle(
    IPC.export.cancel,
    async (_e, jobId: string): Promise<{ ok: boolean; cancelled: boolean }> => {
      const job = activeJobs.get(jobId)
      if (!job) return { ok: false, cancelled: false }
      job.cancelled = true
      activeJobs.delete(jobId)
      return { ok: true, cancelled: true }
    }
  )
}
