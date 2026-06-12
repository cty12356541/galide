import { useEffect, useState, useCallback } from 'react'
import { FileText, Plus, RefreshCw, FilePlus } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { ScrollArea } from '../../components/ui/scroll-area'
import { useUiStore } from '../../lib/store'
import { useScript } from '../../lib/ipc/use-script'
import { useErrorStore } from '../../lib/store'
import { cn } from '../../lib/utils'
import { toast } from '../../components/ui/toast'

/**
 * 剧本文件树(项目根 scripts/ 下列出所有 .gal)
 *
 * 规约: 决策树(剧本)是 .gal 文件,UI 切换 activeScriptFile
 * 时会触发 ScriptEditor 重新 read → FlowView 重新 read → PreviewCanvas 重新 read。
 */
export const ScriptFileTree = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const activeScript = useUiStore((s) => s.activeScriptFile)
  const setActiveScript = useUiStore((s) => s.setActiveScript)
  const script = useScript()
  const pushError = useErrorStore((s) => s.push)
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!projectPath) {
      setFiles([])
      return
    }
    setLoading(true)
    try {
      const list = await script.list(projectPath)
      setFiles(list ?? [])
    } finally {
      setLoading(false)
    }
  }, [projectPath, script])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 切到新项目时,如果 activeScript 不在文件列表,自动选第一个
  useEffect(() => {
    if (files.length > 0 && (!activeScript || !files.includes(activeScript))) {
      setActiveScript(files[0] ?? null)
    }
  }, [files, activeScript, setActiveScript])

  const handleNew = async (): Promise<void> => {
    if (!projectPath) return
    const name = window.prompt('新建剧本文件名', 'chapter2.gal')
    if (!name) return
    const fileName = name.endsWith('.gal') ? name : `${name}.gal`
    if (files.includes(fileName)) {
      pushError({
        code: 'SCRIPT_EXISTS',
        message: `文件已存在: ${fileName}`,
        source: 'script:write'
      })
      return
    }
    try {
      await script.write(projectPath, fileName, `# ${fileName.replace(/\.gal$/, '')}\n\n`)
      setActiveScript(fileName)
      await refresh()
      toast({ message: `已创建 ${fileName}`, variant: 'success' })
    } catch (err) {
      pushError({
        code: 'SCRIPT_CREATE_FAILED',
        message: err instanceof Error ? err.message : String(err),
        source: 'script:write'
      })
    }
  }

  if (!projectPath) return <div />

  return (
    <div className="border-b border-border">
      <div className="h-9 px-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FilePlus className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">剧本</span>
          <span className="text-[10px] text-text-muted">({files.length})</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" onClick={() => void refresh()} title="刷新" className="h-6 w-6">
            <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => void handleNew()} title="新建剧本" className="h-6 w-6">
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>
      <ScrollArea className="max-h-40">
        <div className="px-1.5 pb-1.5 space-y-0.5">
          {files.length === 0 ? (
            <div className="text-[11px] text-text-muted px-2 py-1.5">无 .gal 脚本</div>
          ) : (
            files.map((f) => {
              const isActive = f === activeScript
              return (
                <button
                  key={f}
                  onClick={() => setActiveScript(f)}
                  className={cn(
                    'w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] text-left transition-colors',
                    isActive
                      ? 'bg-accent-soft text-accent font-medium'
                      : 'text-text-muted hover:bg-bg-elevated hover:text-text'
                  )}
                  title={f}
                >
                  <FileText className="w-3 h-3 shrink-0" />
                  <span className="truncate">{f}</span>
                </button>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
