/**
 * GitPanel — SidePanel 的 git 面板
 *
 * 内容:从 useGitStatus 拉当前 branch + dirty files 列表,展示为 SidePanel 形式。
 * 复用现有的 useGitStatus hook(renderer/src/lib/ipc/use-git-status.ts),
 * 不重复实现 git IPC。
 *
 * 交互:点击 dirty file → 触发现有 CommitDialog(规约中"工作区变更点击提交"的占位语义)。
 */

import { GitBranch, AlertCircle, Upload, Download, Link2 } from 'lucide-react'
import { ScrollArea } from '../../components/ui/scroll-area'
import { PanelHeader } from '../../components/ui/panel-header'
import { EmptyState } from '../../components/ui/empty-state'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { useUiStore } from '../../lib/store'
import { useGitStatus } from '../../lib/ipc/use-git-status'
import { toast } from '../../components/ui/toast'
import { useEffect, useState } from 'react'

export const GitPanel = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const manifest = useUiStore((s) => s.manifest)
  const setProject = useUiStore((s) => s.setProject)
  const openCommitDialog = useUiStore((s) => s.openCommitDialog)
  const gitStatus = useGitStatus(projectPath)
  const [syncing, setSyncing] = useState(false)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [savingRemote, setSavingRemote] = useState(false)

  useEffect(() => {
    setRemoteUrl(manifest?.git?.remoteUrl ?? '')
  }, [manifest?.git?.remoteUrl])

  useEffect(() => {
    if (!projectPath || !window.galide?.git?.getRemotes) return
    if (useUiStore.getState().manifest?.git?.remoteUrl) return
    void window.galide.git.getRemotes(projectPath).then((r) => {
      if (r.ok && r.remotes?.length) {
        const origin = r.remotes.find((x) => x.name === 'origin')
        if (origin?.url) {
          setRemoteUrl((prev) => prev || origin.url)
        }
      }
    })
  }, [projectPath])

  const handlePush = async (): Promise<void> => {
    if (!projectPath) return
    setSyncing(true)
    try {
      const r = await window.galide.git.push(projectPath)
      if (!r.ok) {
        toast({ message: r.error ?? 'Push 失败', variant: 'error' })
        return
      }
      toast({ message: '已推送到远程', variant: 'success' })
      await gitStatus.refetch()
    } finally {
      setSyncing(false)
    }
  }

  const handlePull = async (): Promise<void> => {
    if (!projectPath) return
    setSyncing(true)
    try {
      const r = await window.galide.git.pull(projectPath)
      if (!r.ok) {
        toast({ message: r.error ?? 'Pull 失败', variant: 'error' })
        return
      }
      toast({ message: '已从远程拉取', variant: 'success' })
      await gitStatus.refetch()
    } finally {
      setSyncing(false)
    }
  }

  const handleSaveRemote = async (): Promise<void> => {
    if (!projectPath || !manifest) return
    const url = remoteUrl.trim()
    if (!url) {
      toast({ message: '请输入远程 URL', variant: 'error' })
      return
    }
    setSavingRemote(true)
    try {
      const gitR = await window.galide.git.setRemote(projectPath, url)
      if (!gitR.ok) {
        toast({ message: gitR.error ?? '设置 git remote 失败', variant: 'error' })
        return
      }
      const nextManifest = {
        ...manifest,
        git: { ...(manifest.git ?? { initialized: true }), remoteUrl: url }
      }
      setProject(projectPath, nextManifest)
      toast({ message: '远程 URL 已保存', variant: 'success' })
    } finally {
      setSavingRemote(false)
    }
  }

  if (!projectPath) {
    return (
      <div className="h-full flex flex-col bg-surface border-r border-border">
        <PanelHeader title="Git" icon={GitBranch} size="md" />
        <EmptyState icon={GitBranch} title="请先打开项目" description="在欢迎页选择已有项目或创建新项目" />
      </div>
    )
  }

  if (!gitStatus.data?.initialized) {
    return (
      <div className="h-full flex flex-col bg-surface border-r border-border">
        <PanelHeader title="Git" icon={GitBranch} size="md" />
        <EmptyState
          icon={GitBranch}
          title="项目尚未初始化 Git 仓库"
          description="通过顶部菜单或 WelcomeScreen 的「初始化仓库」按钮启用"
        />
      </div>
    )
  }

  const files = gitStatus.data.files
  const current = gitStatus.data.current ?? 'main'

  return (
    <div className="h-full flex flex-col bg-surface border-r border-border">
      <PanelHeader
        title="Git"
        icon={GitBranch}
        subtitle={current}
        size="md"
        actions={
          <>
            <Button variant="ghost" size="sm" disabled={syncing} onClick={() => void handlePull()} title="Pull">
              <Download className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" disabled={syncing} onClick={() => void handlePush()} title="Push">
              <Upload className="w-3.5 h-3.5" />
            </Button>
          </>
        }
      />
      <div className="px-2 py-2 border-b border-border space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <Link2 className="w-3 h-3" />
          远程 origin
        </div>
        <div className="flex gap-1.5">
          <Input
            value={remoteUrl}
            onChange={(e) => setRemoteUrl(e.target.value)}
            placeholder="https://github.com/user/repo.git"
            className="h-8 text-[11px] font-mono flex-1"
            data-testid="git-remote-url-input"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={savingRemote}
            onClick={() => void handleSaveRemote()}
            data-testid="git-remote-save"
          >
            保存
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {files.length === 0 ? (
            <div className="text-[11px] text-text-muted px-2 py-1.5 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" />
              工作区干净
            </div>
          ) : (
            files.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => openCommitDialog()}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-bg-elevated text-left"
                title="点击提交"
              >
                <span className="font-mono text-[10px] w-4 text-center text-warning">
                  {f.working_dir !== ' ' ? f.working_dir : f.index}
                </span>
                <span className="flex-1 text-[11px] font-mono truncate">{f.path}</span>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
