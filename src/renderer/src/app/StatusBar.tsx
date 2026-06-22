/**
 * StatusBar — 6 区块状态栏 (v0.4.1 重设计)
 *
 * 5 区块分两组(左 3 + 右 2),Divider 用 border-strong 加重:
 *   [git branch] | [err N] | [msg N]
 *                <-- flex-1 -->
 *                          [● AI 状态] | [写作 eye/eyeoff]
 */
import { GitBranch, AlertCircle, Bell, Eye, EyeOff, X } from 'lucide-react'
import { useUiStore, useErrorStore } from '../lib/store'
import { useGitStatus } from '../lib/ipc/use-git-status'
import { cn } from '../lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover'

export const StatusBar = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const projectParseError = useUiStore((s) => s.projectParseError)
  const workspacePreset = useUiStore((s) => s.workspacePreset)
  const aiPanelOpen = useUiStore((s) => s.visiblePerSide[s.dockSide.ai] === 'ai')
  const toggleAiPanel = useUiStore((s) => s.toggleAiPanel)
  const entries = useErrorStore((s) => s.entries)
  const dismiss = useErrorStore((s) => s.dismiss)
  const errorEntries = entries.filter((e) => e.code !== 'INFO')
  const infoEntries = entries.filter((e) => e.code === 'INFO')
  const errorCount = errorEntries.length
  const infoCount = infoEntries.length
  const gitStatus = useGitStatus(projectPath)
  const branchLabel = gitStatus.data?.current ?? (projectPath ? '—' : '无项目')
  const aiStatus: 'idle' | 'error' = errorCount > 0 ? 'error' : 'idle'

  return (
    <footer
      aria-label="Status Bar"
      className="h-8 bg-bg border-t border-border-strong flex items-center px-1.5 text-[12px] text-text-muted flex-shrink-0"
      data-testid="status-bar"
    >
      <Block
        icon={<GitBranch className="w-3.5 h-3.5" />}
        label={branchLabel}
        tooltip="Git 分支"
        testId="status-git-branch"
      />
      <Divider />
      {projectParseError ? (
        <span
          title={projectParseError}
          data-testid="status-parse-error"
          className="h-7 px-2.5 rounded-md flex items-center gap-1.5 bg-warning-soft text-warning-strong max-w-[200px]"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">解析失败</span>
        </span>
      ) : null}
      {projectParseError ? <Divider /> : null}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="错误列表"
            data-testid="status-errors"
            className={cn(
              'h-7 px-2.5 rounded-md flex items-center gap-1.5 hover:bg-bg-elevated transition-colors',
              errorCount > 0 && 'bg-danger-soft text-danger'
            )}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{errorCount > 0 ? `${errorCount} 错误` : '0 错误'}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <div className="px-3 py-2 border-b border-border text-xs font-medium">错误</div>
          <div className="max-h-56 overflow-y-auto p-2 space-y-1">
            {errorEntries.length === 0 ? (
              <p className="text-xs text-text-muted px-1 py-2">暂无错误</p>
            ) : (
              errorEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-2 rounded-md bg-danger-soft/50 px-2 py-1.5 text-[11px]"
                  data-testid={`status-error-entry-${entry.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-danger-strong truncate">{entry.message}</div>
                    <div className="text-text-muted font-mono text-[10px]">{entry.source}</div>
                  </div>
                  <button
                    type="button"
                    aria-label="关闭"
                    className="shrink-0 p-0.5 rounded hover:bg-bg-elevated text-text-muted"
                    onClick={() => dismiss(entry.id)}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
      <Divider />
      <Block
        icon={<Bell className="w-3.5 h-3.5" />}
        label={infoCount > 0 ? `${infoCount} 消息` : '0 消息'}
        tooltip="消息"
      />
      <div className="flex-1" />

      <Block
        icon={
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              aiStatus === 'error' && 'bg-danger',
              aiStatus === 'idle' && 'bg-success'
            )}
            data-testid="status-ai-dot"
          />
        }
        label="AI 空闲"
        tooltip="AI 任务状态"
        testId="status-ai"
      />
      <Divider />
      <button
        type="button"
        onClick={toggleAiPanel}
        title={aiPanelOpen ? '隐藏 AI 面板' : '显示 AI 面板'}
        className={cn(
          'h-7 px-2.5 rounded-md flex items-center gap-1.5 hover:bg-bg-elevated transition-colors font-medium',
          aiPanelOpen ? 'text-accent' : ''
        )}
        data-testid="status-ai-toggle"
      >
        {aiPanelOpen ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        <span>
          {workspacePreset === 'writing' ? '写作' : workspacePreset === 'flow' ? '流程' : '评审'}
        </span>
      </button>
    </footer>
  )
}

const Block = ({
  icon,
  label,
  tooltip,
  highlight,
  testId
}: {
  icon: JSX.Element
  label: string
  tooltip?: string
  highlight?: boolean
  testId?: string
}): JSX.Element => (
  <button
    type="button"
    title={tooltip ?? label}
    data-testid={testId}
    className={cn(
      'h-7 px-2.5 rounded-md flex items-center gap-1.5 hover:bg-bg-elevated transition-colors',
      highlight && 'bg-danger-soft text-danger'
    )}
  >
    {icon}
    <span>{label}</span>
  </button>
)

const Divider = (): JSX.Element => <span className="w-px h-4 bg-border-strong mx-1" />
