/**
 * run-export-job — 共享导出核心(IPC handler + agent 工具共用)
 */
import { scriptsDirAbs } from '../../shared/project-layout.js'
import type { ExportProgress, ExportRequest } from '../../shared/types.js'
import { getExportComposer, runComposer, type ExportContext } from './index.js'
import { assertExportableScripts, parseProjectScripts } from './parse-project-scripts.js'
import { countScenesInAsts } from './shared.js'

export type ExportJobFs = {
  readdir: (path: string) => Promise<string[]>
  readFile: (path: string) => Promise<string>
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>
}

export type RunExportJobDeps = {
  fs: ExportJobFs
  onProgress?: (p: ExportProgress) => void
  isCancelled?: () => boolean
}
export type RunExportJobResult =
  | { ok: true; paths: readonly string[] }
  | { ok: false; code: string; error: string }

export const runExportJob = async (
  req: ExportRequest,
  deps: RunExportJobDeps
): Promise<RunExportJobResult> => {
  const progress = deps.onProgress ?? (() => undefined)
  const cancelled = deps.isCancelled ?? (() => false)

  const composer = getExportComposer(req.target)
  if (!composer) {
    return { ok: false, code: 'UNKNOWN_TARGET', error: `Unknown export target: ${req.target}` }
  }

  const scriptsDir = scriptsDirAbs(req.projectPath)
  progress({ stage: 'parse', progress: 0, message: 'Scanning scripts...' })
  const { asts, failures } = await parseProjectScripts(scriptsDir, {
    readdir: (p) => deps.fs.readdir(p),
    readFile: (p) => deps.fs.readFile(p)
  })
  const galFileCount = asts.length + failures.length
  progress({
    stage: 'parse',
    progress: 0.2,
    message: `Found ${galFileCount} scripts`
  })
  if (cancelled()) {
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
  await deps.fs.mkdir(req.outputPath, { recursive: true })
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
}
