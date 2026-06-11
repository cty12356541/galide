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

export const registerExportHandlers = (): void => {
  ipcMain.handle(
    IPC.export.start,
    async (
      _e,
      req: ExportRequest
    ): Promise<{ ok: boolean; error?: string; code?: string; paths?: readonly string[] }> => {
      const win = BrowserWindow.getFocusedWindow()
      const progress = (p: ExportProgress): void => {
        win?.webContents.send(IPC.export.progress, p)
      }
      try {
        const composer = getExportComposer(req.target)
        if (!composer) {
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
        return { ok: true, paths }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false, error: message }
      }
    }
  )
}
