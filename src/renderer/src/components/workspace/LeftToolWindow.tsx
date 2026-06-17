/**
 * LeftToolWindow — 左侧 Tool Window 主区
 *
 * 设计(P7):
 *   - 主 tab(项目 / Git)由 ActivityBar 控制,本组件不再渲染
 *   - 只保留子 tab(文件 / 资产)+ 浮出 / 关闭按钮
 *   - 显示哪个 panel 由 store.activitySelection 决定
 */
import { useState } from 'react'
import { X, AppWindow } from 'lucide-react'
import { useUiStore } from '../../lib/store'
import { usePanelFloat } from '../../lib/hooks/use-panel-float'
import { ScriptFileTree } from '../../features/script-editor/ScriptFileTree'
import { AssetListPanel } from '../../features/asset/AssetListPanel'
import { GitPanel } from '../../features/git/GitPanel'
import { PlaceholderToolWindow } from './PlaceholderToolWindow'
import { Search, Bug, Settings } from 'lucide-react'
import { cn } from '../../lib/utils'

export const LeftToolWindow = (): JSX.Element => {
  const leftPanel = useUiStore((s) => s.leftPanel)
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel)
  const projectPath = useUiStore((s) => s.projectPath)
  const activitySelection = useUiStore((s) => s.activitySelection)

  const [secondaryTab, setSecondaryTab] = useState<'files' | 'assets'>('files')
  const float = usePanelFloat()

  // ActivityBar 控制显示
  if (activitySelection === 'search') {
    return (
      <aside className="h-full flex flex-col bg-surface" data-testid="left-tool-window">
        <Header float={float} onClose={toggleLeftPanel} />
        <PlaceholderToolWindow icon={Search} title="搜索" description="跨文件全文搜索(即将支持)" />
      </aside>
    )
  }
  if (activitySelection === 'debug') {
    return (
      <aside className="h-full flex flex-col bg-surface" data-testid="left-tool-window">
        <Header float={float} onClose={toggleLeftPanel} />
        <PlaceholderToolWindow icon={Bug} title="调试" description="运行/断点/变量查看(即将支持)" />
      </aside>
    )
  }
  if (activitySelection === 'settings') {
    return (
      <aside className="h-full flex flex-col bg-surface" data-testid="left-tool-window">
        <Header float={float} onClose={toggleLeftPanel} />
        <PlaceholderToolWindow icon={Settings} title="设置" description="IDE 偏好配置(即将支持)" />
      </aside>
    )
  }

  // project / git 走 leftPanel 旧字段(向后兼容快捷键)
  const active = (leftPanel === 'closed' ? 'project' : leftPanel) as 'project' | 'git'

  return (
    <aside className="group h-full flex flex-col bg-surface" data-testid="left-tool-window">
      <Header float={float} onClose={toggleLeftPanel} />
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

const Header = ({
  float,
  onClose
}: {
  float: (id: string) => void
  onClose: () => void
}): JSX.Element => {
  return (
    <header className="h-9 flex items-center bg-bg-elevated border-b border-border px-2.5 gap-1 justify-end">
      <button
        type="button"
        onClick={() => float('left-tool-window')}
        title="浮出到独立窗口"
        aria-label="浮出到独立窗口"
        data-testid="left-float"
        className="h-7 w-7 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <AppWindow className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onClose}
        title="关闭 Tool Window"
        aria-label="关闭 Tool Window"
        className="h-7 w-7 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </header>
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
            'h-7 px-2.5 rounded transition-colors font-medium relative',
            secondaryTab === 'files'
              ? 'bg-surface text-text border border-border shadow-sm'
              : 'text-text-muted hover:text-text'
          )}
        >
          文件
        </button>
        <button
          type="button"
          onClick={() => setSecondaryTab('assets')}
          className={cn(
            'h-7 px-2.5 rounded transition-colors font-medium relative',
            secondaryTab === 'assets'
              ? 'bg-surface text-text border border-border shadow-sm'
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
