/**
 * StatusBar — 6 区块状态栏 (v0.4.1 重设计)
 *
 * 6 区块分两组(左 4 + 右 2),Divider 用 border-strong 加重:
 *   [git main] | [err N] | [msg N] | [100%]
 *                <-- flex-1 -->
 *                          [● AI 状态] | [写作 eye/eyeoff]
 *
 * AI 状态点:running 时橙,error 时红,idle 时绿
 * error > 0 时 error block 背景 danger-soft
 */
import { GitBranch, AlertCircle, Bell, Maximize2, Eye, EyeOff } from 'lucide-react'
import { useUiStore, useErrorStore } from '../lib/store'
import { cn } from '../lib/utils'

export const StatusBar = (): JSX.Element => {
  const workspacePreset = useUiStore((s) => s.workspacePreset)
  const aiPanelOpen = useUiStore((s) => s.aiPanelOpen)
  const toggleAiPanel = useUiStore((s) => s.toggleAiPanel)
  const errorCount = useErrorStore((s) => s.entries.filter((e) => e.code !== 'INFO').length)
  const infoCount = useErrorStore((s) => s.entries.filter((e) => e.code === 'INFO').length)
  // 简化:有 error 记录就当 AI "error",否则 idle(后续 PR 接 AI 实际 status 字段)
  const aiStatus: 'idle' | 'running' | 'error' = (errorCount > 0 ? 'error' : 'idle') as 'idle' | 'running' | 'error'

  return (
    <footer
      aria-label="Status Bar"
      className="h-8 bg-bg border-t border-border-strong flex items-center px-1.5 text-[12px] text-text-muted flex-shrink-0"
      data-testid="status-bar"
    >
      {/* 左 4 区块 */}
      <Block
        icon={<GitBranch className="w-3.5 h-3.5" />}
        label="main"
        tooltip="Git 分支"
      />
      <Divider />
      <Block
        icon={<AlertCircle className="w-3.5 h-3.5" />}
        label={errorCount > 0 ? `${errorCount} 错误` : '0 错误'}
        tooltip="错误数"
        highlight={errorCount > 0}
      />
      <Divider />
      <Block
        icon={<Bell className="w-3.5 h-3.5" />}
        label={infoCount > 0 ? `${infoCount} 消息` : '0 消息'}
        tooltip="消息"
      />
      <Divider />
      <Block
        icon={<Maximize2 className="w-3.5 h-3.5" />}
        label="100%"
        tooltip="UI 缩放"
      />

      {/* 中间 spacer */}
      <div className="flex-1" />

      {/* 右 2 区块 */}
      <Block
        icon={
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              aiStatus === 'error' && 'bg-danger',
              aiStatus === 'running' && 'bg-warning',
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
          {workspacePreset === 'writing'
            ? '写作'
            : workspacePreset === 'flow'
              ? '流程'
              : '评审'}
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
