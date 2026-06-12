import { useEffect, useState } from 'react'
import { GitCommit, Loader2, CheckCircle2, AlertCircle, GitBranch } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog'
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
 * 规约: layers/main-process/conventions.yaml:28-32
 *   - "不支持的命令不暴露"
 *   - "每次保存自动 add + commit"(autocommit 是 preferences 默认行为;
 *     此对话框给用户"主动提交"的入口,免得 work tree 脏着不收口)
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

  useEffect(() => {
    if (!open) {
      setMessage('')
      setStage('idle')
      setErrorMsg('')
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
    const r = await git.commit(projectPath, message.trim())
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
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCommit className="w-4 h-4" />
            Git 提交
          </DialogTitle>
          <DialogDescription>
            <span className="inline-flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              {currentBranch ?? '—'}
            </span>
            <span className="ml-2">{initialized ? `${dirtyCount} 个变更` : '项目尚未 git init'}</span>
          </DialogDescription>
        </DialogHeader>

        {!initialized ? (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div>
              当前项目未初始化 Git 仓库。打开偏好 → Git 开启"新建项目自动 git init",
              或在终端手动运行 <code className="font-mono">git init</code>。
            </div>
          </div>
        ) : dirtyCount === 0 ? (
          <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
            <CheckCircle2 className="w-3.5 h-3.5" />
            工作区干净,无需要提交的变更。
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-text-muted font-mono max-h-32 overflow-y-auto border border-border rounded-lg bg-bg p-2 space-y-0.5">
              {gitStatus.data?.files.map((f) => (
                <div key={f.path} className="truncate">
                  <span
                    className={
                      f.working_dir !== ' ' || f.index !== ' '
                        ? 'text-amber-600'
                        : 'text-text-muted'
                    }
                  >
                    {f.working_dir === ' ' && f.index !== ' ' ? 'A' : f.working_dir}
                  </span>
                  <span className="ml-1">{f.path}</span>
                </div>
              ))}
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
          <div className="text-xs text-red-600">{errorMsg}</div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            关闭
          </Button>
          <Button
            onClick={() => void handleCommit()}
            disabled={!initialized || dirtyCount === 0 || !message.trim() || stage === 'committing'}
          >
            {stage === 'committing' ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <GitCommit className="w-3.5 h-3.5 mr-1" />
            )}
            提交
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
