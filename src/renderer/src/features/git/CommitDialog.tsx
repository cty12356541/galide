import { useEffect, useState } from 'react'
import { GitCommit, Loader2, CheckCircle2, AlertCircle, GitBranch, FileText } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '../../components/ui/sheet'
import { Button } from '../../components/ui/button'
import { Textarea } from '../../components/ui/textarea'
import { useUiStore } from '../../lib/store'
import { useGit } from '../../lib/ipc/use-git'
import { useGitStatus } from '../../lib/ipc/use-git-status'
import { useErrorStore } from '../../lib/store'
import { toast } from '../../components/ui/toast'

type Stage = 'idle' | 'committing' | 'done' | 'error'

/**
 * Git 提交对话框
 *
 * 主历史提交入口(P2:存盘与提交解耦后,默认不自动提交,由本对话框收口)。
 * 勾选要暂存的文件 + 填写提交信息 → git:addAndCommit(选中文件)。
 */
export const CommitDialog = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const open = useUiStore((s) => s.commitDialogOpen)
  const close = useUiStore((s) => s.closeCommitDialog)
  const git = useGit()
  const gitStatus = useGitStatus(projectPath)
  const pushError = useErrorStore((s) => s.push)
  const [message, setMessage] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // 工作区变更刷新时,默认全选
  useEffect(() => {
    if (open && gitStatus.data) {
      setSelected(new Set(gitStatus.data.files.map((f) => f.path)))
    }
  }, [open, gitStatus.data])

  useEffect(() => {
    if (!open) {
      setMessage('')
      setStage('idle')
      setErrorMsg('')
      setSelected(new Set())
    }
  }, [open])

  const dirtyCount = gitStatus.data?.files.length ?? 0
  const initialized = gitStatus.data?.initialized ?? false
  const currentBranch = gitStatus.data?.current ?? null

  const handleCommit = async (): Promise<void> => {
    if (!projectPath) return
    if (!message.trim()) {
      pushError({
        code: 'COMMIT_MSG_EMPTY',
        message: '提交信息不能为空',
        source: 'git:commit'
      })
      return
    }
    setStage('committing')
    setErrorMsg('')
    const files = Array.from(selected)
    const r = await git.commit(projectPath, message.trim(), files.length > 0 ? files : undefined)
    if (!r?.ok) {
      setStage('error')
      setErrorMsg('提交失败(可能未 git init 或无改动)')
      return
    }
    setStage('done')
    toast({ message: '已提交', variant: 'success' })
    setTimeout(() => {
      void gitStatus.refetch()
      close()
    }, 600)
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <GitCommit className="w-4 h-4" />
            Git 提交
          </SheetTitle>
          <SheetDescription>
            <span className="inline-flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              {currentBranch ?? '—'}
            </span>
            <span className="ml-2">{initialized ? `${dirtyCount} 个变更` : '项目尚未 git init'}</span>
          </SheetDescription>
        </SheetHeader>

        {!initialized ? (
          <div className="flex items-start gap-2 text-xs text-warning-strong bg-warning-soft border border-warning rounded-lg p-3">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div>
              当前项目未初始化 Git 仓库。打开偏好 → Git 开启"新建项目自动 git init",
              或在终端手动运行 <code className="font-mono">git init</code>。
            </div>
          </div>
        ) : dirtyCount === 0 ? (
          <div className="flex items-center gap-2 text-xs text-success-strong bg-success-soft border border-success rounded-lg p-3">
            <CheckCircle2 className="w-3.5 h-3.5" />
            工作区干净,无需要提交的变更。
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-text-muted max-h-40 overflow-y-auto border border-border rounded-lg bg-bg p-1.5 space-y-0.5">
              {gitStatus.data?.files.map((f) => {
                const checked = selected.has(f.path)
                return (
                  <label
                    key={f.path}
                    className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-surface cursor-pointer font-mono"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelected((prev) => {
                          const next = new Set(prev)
                          if (next.has(f.path)) next.delete(f.path)
                          else next.add(f.path)
                          return next
                        })
                      }}
                      className="accent-accent"
                    />
                    <FileText className="w-3 h-3 flex-shrink-0 text-text-muted" />
                    <span
                      className={
                        f.working_dir !== ' ' || f.index !== ' '
                          ? 'text-warning'
                          : 'text-text-muted'
                      }
                    >
                      {f.working_dir === ' ' && f.index !== ' ' ? 'A' : f.working_dir}
                    </span>
                    <span className="ml-1 truncate text-text">{f.path}</span>
                  </label>
                )
              })}
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="提交信息 (e.g. feat: 写完第一章)"
              rows={3}
              autoFocus
            />
          </div>
        )}

        {errorMsg && (
          <div className="text-xs text-danger">{errorMsg}</div>
        )}

        <SheetFooter>
          <Button variant="ghost" onClick={close}>
            关闭
          </Button>
          <Button
            onClick={() => void handleCommit()}
            disabled={!initialized || dirtyCount === 0 || selected.size === 0 || !message.trim() || stage === 'committing'}
          >
            {stage === 'committing' ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <GitCommit className="w-3.5 h-3.5 mr-1" />
            )}
            提交
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
