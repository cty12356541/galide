import { useState } from 'react'
import { GitBranch, FileText, Check, History, X } from 'lucide-react'
import { Button } from '../components/ui/button'
import { useUiStore } from '../lib/store'
import { useGitStatus } from '../lib/ipc/use-git-status'
import { useGit } from '../lib/ipc/use-git'
import { useErrorStore } from '../lib/store'
import { toast } from '../components/ui/toast'
import { cn } from '../lib/utils'

type Commit = {
  hash: string
  date: string
  message: string
  author: string
}

export const StatusBar = (): JSX.Element => {
  const projectName = useUiStore((s) => s.projectName)
  const projectPath = useUiStore((s) => s.projectPath)
  const activeScript = useUiStore((s) => s.activeScriptFile)
  const errorCount = useErrorStore((s) => s.entries.length)
  const openCommit = useUiStore((s) => s.openCommitDialog)
  const gitStatus = useGitStatus(projectPath)
  const git = useGit()
  const pushError = useErrorStore((s) => s.push)
  const [showLog, setShowLog] = useState(false)
  const [commits, setCommits] = useState<Commit[]>([])
  const [logLoading, setLogLoading] = useState(false)

  const handleToggleLog = async (): Promise<void> => {
    if (!projectPath) return
    if (showLog) {
      setShowLog(false)
      return
    }
    setShowLog(true)
    setLogLoading(true)
    try {
      const r = await git.log(projectPath)
      setCommits(r ?? [])
    } catch (err) {
      pushError({
        code: 'GIT_LOG_FAILED',
        message: err instanceof Error ? err.message : String(err),
        source: 'git:log'
      })
    } finally {
      setLogLoading(false)
    }
  }

  const handleShowDiff = async (filePath: string): Promise<void> => {
    if (!projectPath) return
    const diff = await git.diff(projectPath, filePath)
    if (diff === undefined) {
      toast({ message: '获取 diff 失败', variant: 'error' })
      return
    }
    if (!diff.trim()) {
      toast({ message: `${filePath} 无变更`, variant: 'default' })
      return
    }
    // 简易 diff viewer:用 dialog 显示
    const lines = diff.split('\n')
    const head = lines.slice(0, 400).join('\n')
    const truncated = lines.length > 400
    toast({
      message: `${filePath} (${lines.length} 行,前 400 行已显示)`,
      description: truncated ? `${head}\n…(已截断)` : head,
      variant: 'default'
    })
  }

  return (
    <>
      <footer className="h-7 bg-surface border-t border-border flex items-center justify-between px-3 text-[11px] text-text-muted">
        <div className="flex items-center gap-3">
          <span className="font-medium text-text">{projectName ?? '未打开项目'}</span>
          {activeScript && (
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {activeScript}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {gitStatus.data?.initialized && (
            <>
              <button
                onClick={handleToggleLog}
                className="flex items-center gap-1 hover:text-text transition-colors"
                title="查看 Git 历史"
              >
                <GitBranch className="w-3 h-3" />
                {gitStatus.data.current ?? 'main'}
                {gitStatus.data.files.length > 0 && (
                  <span className="text-accent">+{gitStatus.data.files.length}</span>
                )}
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={openCommit}
                disabled={gitStatus.data.files.length === 0}
                className="h-5 text-[10px] px-1.5"
                title={gitStatus.data.files.length === 0 ? '无变更' : 'Git 提交'}
              >
                提交
              </Button>
            </>
          )}
          {errorCount > 0 && (
            <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
              ⚠ {errorCount} 错误
            </span>
          )}
          <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
            <Check className="w-3 h-3" />
            Ready
          </span>
        </div>
      </footer>
      {showLog && (
        <div className="absolute bottom-7 right-0 w-96 max-h-80 bg-surface border border-border rounded-tl-2xl shadow-xl z-30 flex flex-col">
          <div className="h-9 px-3 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <History className="w-3.5 h-3.5" />
              Git 历史
            </div>
            <Button variant="ghost" size="icon" onClick={() => setShowLog(false)} className="h-6 w-6">
              <X className="w-3 h-3" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 text-xs space-y-1">
            {logLoading ? (
              <div className="text-text-muted">加载中…</div>
            ) : commits.length === 0 ? (
              <div className="text-text-muted">无提交</div>
            ) : (
              commits.map((c) => (
                <div key={c.hash} className="border border-border rounded-md p-2 bg-bg">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-[10px] text-accent">{c.hash.slice(0, 7)}</code>
                    <span className="text-[10px] text-text-muted">{c.date}</span>
                  </div>
                  <div className="mt-1">{c.message}</div>
                  <div className="text-[10px] text-text-muted">{c.author}</div>
                </div>
              ))
            )}
          </div>
          {gitStatus.data && gitStatus.data.files.length > 0 && (
            <div className="border-t border-border p-2">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                工作区变更 (点击查看 diff)
              </div>
              <div className="space-y-0.5 max-h-32 overflow-y-auto">
                {gitStatus.data.files.map((f) => (
                  <button
                    key={f.path}
                    onClick={() => void handleShowDiff(f.path)}
                    className={cn(
                      'w-full text-left px-2 py-1 rounded text-[11px] font-mono hover:bg-bg-elevated truncate',
                      f.working_dir !== ' ' || f.index !== ' ' ? 'text-amber-600' : 'text-text-muted'
                    )}
                  >
                    {f.path}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
