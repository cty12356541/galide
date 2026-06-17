/**
 * LeftToolWindow — PyCharm Project 风格左侧 Tool Window
 *
 * 设计:
 *   - 顶部 tab 列表(项目 / Git)— 点击切换
 *   - tab 数量小(2-3 个),不像旧 ActivityBar 6 个图标
 *   - tab 切换显示对应 panel(FileTree / GitPanel)
 *   - 当 leftPanel === 'closed' 或 leftPanelOpen === false 时不渲染
 *
 * 与旧 ActivityBar 对比:
 *   - 旧:6 个图标按钮 + 独立 SidePanel(multi-split) — 视觉杂乱、空间浪费
 *   - 新:tab + 单一 panel(PyCharm 习惯) — 紧凑、清晰
 */
import { useState } from 'react'
import { Folder, GitBranch, X, AppWindow } from 'lucide-react'
import { useUiStore, type LeftPanelId } from '../../lib/store'
import { usePanelFloat } from '../../lib/hooks/use-panel-float'
import { ScriptFileTree } from '../../features/script-editor/ScriptFileTree'
import { AssetListPanel } from '../../features/asset/AssetListPanel'
import { GitPanel } from '../../features/git/GitPanel'
import { cn } from '../../lib/utils'

type Tab = {
  id: Exclude<LeftPanelId, 'closed'>
  icon: typeof Folder
  title: string
}

const TABS: readonly Tab[] = [
  { id: 'project', icon: Folder, title: '项目' },
  { id: 'git', icon: GitBranch, title: 'Git' }
]

export const LeftToolWindow = (): JSX.Element => {
  const leftPanel = useUiStore((s) => s.leftPanel)
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel)
  const setLeftPanel = useUiStore((s) => s.setLeftPanel)
  const projectPath = useUiStore((s) => s.projectPath)

  const active = (leftPanel === 'closed' ? 'project' : leftPanel) as Tab['id']
  const [secondaryTab, setSecondaryTab] = useState<'files' | 'assets'>('files')
  const float = usePanelFloat()

  return (
    <aside className="h-full flex flex-col bg-surface" data-testid="left-tool-window">
      <header className="h-9 flex items-center bg-bg-elevated border-b border-border px-2.5 gap-1">
        {TABS.map(({ id, icon: Icon, title }) => (
          <button
            key={id}
            type="button"
            onClick={() => setLeftPanel(id)}
            title={title}
            data-testid={`left-tab-${id}`}
            className={cn(
              'h-8 px-3 rounded-md text-[13px] font-medium flex items-center gap-1.5 transition-colors',
              active === id
                ? 'bg-accent-soft text-accent'
                : 'text-text-muted hover:text-text hover:bg-bg-elevated'
            )}
          >
            <Icon className="w-4 h-4" />
            {title}
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => float('left-tool-window')}
          title="浮出到独立窗口"
          aria-label="浮出到独立窗口"
          data-testid="left-float"
          className="h-8 w-8 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface transition-colors"
        >
          <AppWindow className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={toggleLeftPanel}
          title="关闭 Tool Window"
          aria-label="关闭 Tool Window"
          className="h-7 w-7 rounded flex items-center justify-center text-text-muted hover:text-text hover:bg-bg-elevated transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </header>
      <div className="flex-1 overflow-hidden">
        {active === 'project' ? (
          <ProjectTab projectPath={projectPath} secondaryTab={secondaryTab} setSecondaryTab={setSecondaryTab} />
        ) : (
          <GitPanel />
        )}
      </div>
    </aside>
  )
}

const ProjectTab = ({
  projectPath,
  secondaryTab,
  setSecondaryTab
}: {
  projectPath: string | null
  secondaryTab: 'files' | 'assets'
  setSecondaryTab: (t: 'files' | 'assets') => void
}): JSX.Element => {
  if (!projectPath) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-xs p-4">
        请先创建或打开项目
      </div>
    )
  }
  return (
    <div className="h-full flex flex-col">
      <div className="h-8 flex items-center bg-bg-elevated border-b border-border px-2 gap-1 text-[12px]">
        <button
          type="button"
          onClick={() => setSecondaryTab('files')}
          className={cn(
            'h-7 px-2.5 rounded transition-colors font-medium',
            secondaryTab === 'files'
              ? 'bg-bg-elevated text-text'
              : 'text-text-muted hover:text-text'
          )}
        >
          文件
        </button>
        <button
          type="button"
          onClick={() => setSecondaryTab('assets')}
          className={cn(
            'h-7 px-2.5 rounded transition-colors font-medium',
            secondaryTab === 'assets'
              ? 'bg-bg-elevated text-text'
              : 'text-text-muted hover:text-text'
          )}
        >
          资产
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {secondaryTab === 'files' ? <ScriptFileTree /> : <AssetListPanel />}
      </div>
    </div>
  )
}
