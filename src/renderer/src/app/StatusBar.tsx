/**
 * StatusBar — PyCharm 风格 6 区块状态栏
 *
 * 设计:
 *   - 左: git 分支 + 未提交数
 *   - 错误: 错误数(可点击查看)
 *   - 消息: 通知数
 *   - 光标: 当前行列(占位,后续接 editor 状态)
 *   - 缩放: UI 缩放
 *   - AI 状态: idle / generating
 *
 * 6 区块设计 — 模仿 PyCharm status bar 6 栏
 */
import { GitBranch, AlertCircle, Bell, Maximize2, Cpu, Eye, EyeOff } from 'lucide-react'
import { useUiStore } from '../lib/store'
import { useErrorStore } from '../lib/store'
import { cn } from '../lib/utils'

export const StatusBar = (): JSX.Element => {
  const workspacePreset = useUiStore((s) => s.workspacePreset)
  const aiPanelOpen = useUiStore((s) => s.aiPanelOpen)
  const toggleAiPanel = useUiStore((s) => s.toggleAiPanel)
  const errorCount = useErrorStore((s) => s.entries.filter((e) => e.code !== 'INFO').length)
  const infoCount = useErrorStore((s) => s.entries.filter((e) => e.code === 'INFO').length)

  return (
    <footer
      aria-label="Status Bar"
      className="h-7 bg-surface border-t border-border flex items-center px-1 text-[11px] text-text-muted flex-shrink-0"
      data-testid="status-bar"
    >
      <Block icon={<GitBranch className="w-3 h-3" />} label="main" tooltip="Git 分支" />
      <Divider />
      <Block
        icon={<AlertCircle className="w-3 h-3" />}
        label={errorCount > 0 ? `${errorCount} 错误` : '0 错误'}
        tooltip="错误数"
        highlight={errorCount > 0}
      />
      <Divider />
      <Block icon={<Bell className="w-3 h-3" />} label={infoCount > 0 ? `${infoCount} 消息` : '0 消息'} tooltip="消息" />
      <Divider />
      <Block icon={<Maximize2 className="w-3 h-3" />} label="100%" tooltip="UI 缩放" />
      <div className="flex-1" />
      <Block
        icon={<Cpu className="w-3 h-3" />}
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
          'h-6 px-2 rounded flex items-center gap-1.5 hover:bg-bg-elevated transition-colors',
          aiPanelOpen ? 'text-accent' : ''
        )}
        data-testid="status-ai-toggle"
      >
        {aiPanelOpen ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        <span>{workspacePreset === 'writing' ? '写作' : workspacePreset === 'flow' ? '流程' : '评审'}</span>
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
      'h-6 px-2 rounded flex items-center gap-1.5 hover:bg-bg-elevated transition-colors',
      highlight ? 'text-red-500' : ''
    )}
  >
    {icon}
    <span>{label}</span>
  </button>
)

const Divider = (): JSX.Element => <span className="w-px h-4 bg-border mx-0.5" />
