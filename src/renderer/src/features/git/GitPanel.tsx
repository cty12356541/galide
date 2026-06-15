/**
 * GitPanel — SidePanel 的 git 面板
 *
 * 内容:从 useGitStatus 拉当前 branch + dirty files 列表,展示为 SidePanel 形式。
 * 复用现有的 useGitStatus hook(renderer/src/lib/ipc/use-git-status.ts),
 * 不重复实现 git IPC。
 *
 * 交互:点击 dirty file → 触发现有 CommitDialog(规约中"工作区变更点击提交"的占位语义)。
 */

import { GitBranch, AlertCircle } from 'lucide-react'
import { ScrollArea } from '../../components/ui/scroll-area'
import { useUiStore } from '../../lib/store'
import { useGitStatus } from '../../lib/ipc/use-git-status'

export const GitPanel = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const openCommitDialog = useUiStore((s) => s.openCommitDialog)
  const gitStatus = useGitStatus(projectPath)

  if (!projectPath) {
    return (
      <div className="h-full flex flex-col bg-surface border-r border-border">
        <div className="h-10 px-3 flex items-center gap-2 border-b border-border">
          <GitBranch className="w-4 h-4 text-text-muted" />
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Git</span>
        </div>
        <div className="p-4 text-[11px] text-text-muted">请先打开项目</div>
      </div>
    )
  }

  if (!gitStatus.data?.initialized) {
    return (
      <div className="h-full flex flex-col bg-surface border-r border-border">
        <div className="h-10 px-3 flex items-center gap-2 border-b border-border">
          <GitBranch className="w-4 h-4 text-text-muted" />
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Git</span>
        </div>
        <div className="p-4 space-y-2">
          <div className="text-[11px] text-text-muted">项目尚未初始化 Git 仓库。</div>
          <div className="text-[10px] text-text-muted">
            通过顶部菜单或 WelcomeScreen 的"初始化仓库"按钮启用。
          </div>
        </div>
      </div>
    )
  }

  const files = gitStatus.data.files
  const current = gitStatus.data.current ?? 'main'

  return (
    <div className="h-full flex flex-col bg-surface border-r border-border">
      <div className="h-10 px-3 flex items-center gap-2 border-b border-border">
        <GitBranch className="w-4 h-4 text-text-muted" />
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Git</span>
        <span className="text-[10px] text-text-muted">({current})</span>
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
                <span className="font-mono text-[10px] w-4 text-center text-amber-600">
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