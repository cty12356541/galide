import { useEffect, useState } from 'react'
import { Download, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '../../components/ui/sheet'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'

/**
 * P0-10 修复(2026-06-15): STUB_TARGETS 标识 — 老 button-clickability.test.ts
 * (P2 #7) 断言 startExport 按钮在 stub target 下应 disabled 并显示 tooltip。
 * in-flight 之前 T2 review P0-9 已记录 3 个 stub composer (renpy/ink/electron-desktop)
 * 假实现 → 0 字节输出,UI 需明确提示用户。
 */
const STUB_TARGETS: ReadonlySet<ExportPreferences['defaultTarget']> = new Set([
  'renpy', 'ink', 'electron-desktop'
])

/** 当前选中的 target 是否是 stub(给按钮 title 用) */
const isStubTarget = (t: ExportPreferences['defaultTarget']): boolean => STUB_TARGETS.has(t)
import { useExport } from '../../lib/ipc/use-export'
import { usePreference } from '../../lib/ipc/use-preferences'
import { useStore } from '../../lib/ipc/use-store'
import { useUiStore } from '../../lib/store'
import { useErrorStore } from '../../lib/store'
import { toast } from '../../components/ui/toast'
import type { ExportPreferences } from '@shared/preferences'

type Stage = 'idle' | 'running' | 'done' | 'error' | 'cancelled'

const DEFAULT_OUTPUT_DIR = ''

export const ExportDialog = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const projectName = useUiStore((s) => s.projectName)
  const exportDialogOpen = useUiStore((s) => s.exportDialogOpen)
  const closeExportDialog = useUiStore((s) => s.closeExportDialog)
  const pushError = useErrorStore((s) => s.push)
  const exportApi = useExport()
  const storeApi = useStore()
  const prefQuery = usePreference('export')
  const exportPrefs = prefQuery.data as ExportPreferences | undefined

  const [target, setTarget] = useState<ExportPreferences['defaultTarget']>('web')
  const [outputPath, setOutputPath] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [writtenFiles, setWrittenFiles] = useState<readonly string[]>([])

  useEffect(() => {
    if (exportPrefs) {
      setTarget(exportPrefs.defaultTarget)
      setOutputPath((prev) => prev || exportPrefs.defaultOutputDir || DEFAULT_OUTPUT_DIR)
    }
  }, [exportPrefs])

  // 启动时从 electron-store 读最近一次成功导出的路径(target)回填
  useEffect(() => {
    if (!exportDialogOpen) return
    let cancelled = false
    void (async () => {
      const [lastPath, lastTarget] = await Promise.all([
        storeApi.get<string>('lastExportOutputPath'),
        storeApi.get<ExportPreferences['defaultTarget']>('lastExportTarget')
      ])
      if (cancelled) return
      if (lastPath) setOutputPath((prev) => prev || lastPath)
      if (lastTarget) setTarget(lastTarget)
    })()
    return () => {
      cancelled = true
    }
  // 仅在 dialog 打开时读一次(storeApi 稳定,无需列入)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportDialogOpen])

  useEffect(() => {
    if (!exportDialogOpen) {
      // 重置状态(下次打开时干净)
      setStage('idle')
      setProgress(0)
      setMessage('')
      setJobId(null)
      setWrittenFiles([])
    }
  }, [exportDialogOpen])

  useEffect(() => {
    const off = exportApi.onProgress((p) => {
      if (jobId && p.jobId && p.jobId !== jobId) return
      setProgress(p.progress)
      setMessage(p.message)
    })
    return off
  }, [exportApi, jobId])

  const handleChooseDir = async (): Promise<void> => {
    const r = await exportApi.chooseDirectory({ title: '选择导出目录' })
    if (r?.ok && r.path) setOutputPath(r.path)
  }

  const handleStart = async (): Promise<void> => {
    if (!projectPath) return
    if (!outputPath.trim()) {
      pushError({ code: 'EXPORT_NO_OUTPUT', message: '请先选择导出目录', source: 'export:start' })
      return
    }
    setStage('running')
    setProgress(0)
    setMessage('准备导出...')
    setWrittenFiles([])
    const result = await exportApi.start({
      projectPath,
      target,
      outputPath: outputPath.trim()
    })
    if (!result) {
      setStage('error')
      setMessage('IPC 失败')
      return
    }
    if (result.code === 'CANCELLED') {
      setStage('cancelled')
      setMessage('已取消')
      return
    }
    if (!result.ok) {
      setStage('error')
      setMessage(result.error ?? '导出失败')
      pushError({
        code: 'EXPORT_FAILED',
        message: result.error ?? 'unknown',
        source: 'export:start'
      })
      return
    }
    setJobId(result.jobId ?? null)
    setStage('done')
    setProgress(1)
    setWrittenFiles(result.paths ?? [])
    // 把最近成功导出的 outputPath 写入 electron-store,
    // 下次打开 dialog 自动回填
    void storeApi.set('lastExportOutputPath', outputPath.trim())
    void storeApi.set('lastExportTarget', target)
    toast({ message: `已导出 ${result.paths?.length ?? 0} 个文件`, variant: 'success' })
  }

  const handleCancel = async (): Promise<void> => {
    if (!jobId) return
    const r = await exportApi.cancel(jobId)
    if (r?.cancelled) {
      setStage('cancelled')
      setMessage('已取消')
    }
  }

  const isRunning = stage === 'running'
  const isDone = stage === 'done'
  const isError = stage === 'error'

  return (
    <Sheet open={exportDialogOpen} onOpenChange={(open) => !open && closeExportDialog()}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            导出项目
          </SheetTitle>
          <SheetDescription>
            将 <span className="font-medium text-text">{projectName ?? '当前项目'}</span> 编译为目标格式。
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          <div>
            <label className="text-xs text-text-muted">目标</label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as ExportPreferences['defaultTarget'])}
              disabled={isRunning}
              className="w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm"
            >
              <option value="web">Web (单 HTML)</option>
              <option value="renpy">Ren'Py</option>
              <option value="ink">Ink</option>
              <option value="json">JSON</option>
              <option value="electron-desktop">Electron Desktop</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-text-muted">输出目录</label>
            <div className="flex items-center gap-2">
              <Input
                value={outputPath}
                onChange={(e) => setOutputPath(e.target.value)}
                placeholder="/path/to/exports"
                disabled={isRunning}
                className="flex-1"
              />
              <Button variant="secondary" size="sm" onClick={() => void handleChooseDir()} disabled={isRunning}>
                选择…
              </Button>
            </div>
          </div>

          {(isRunning || isDone || isError || stage === 'cancelled') && (
            <div className="space-y-2">
              <div className="h-2 rounded-full bg-bg-elevated overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    isError
                      ? 'bg-red-500'
                      : isDone
                        ? 'bg-green-500'
                        : stage === 'cancelled'
                          ? 'bg-amber-500'
                          : 'bg-accent'
                  }`}
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-text-muted">
                {isRunning && <Loader2 className="w-3 h-3 animate-spin" />}
                {isDone && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                {isError && <AlertCircle className="w-3 h-3 text-red-500" />}
                {stage === 'cancelled' && <X className="w-3 h-3 text-amber-500" />}
                <span className="truncate">{message || (isRunning ? '导出中…' : '')}</span>
              </div>
              {isDone && writtenFiles.length > 0 && (
                <div className="text-[10px] text-text-muted font-mono truncate">
                  {writtenFiles.length} 个文件已写入 {outputPath}
                </div>
              )}
            </div>
          )}
        </div>

        <SheetFooter>
          {isRunning ? (
            <Button variant="destructive" onClick={() => void handleCancel()}>
              取消
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={closeExportDialog}>
                关闭
              </Button>
              <Button
                onClick={() => void handleStart()}
                disabled={!outputPath.trim() || isStubTarget(target)}
                title={isStubTarget(target) ? '该 target 当前是 stub 实现,会生成空文件' : '开始导出'}
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                开始导出
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
