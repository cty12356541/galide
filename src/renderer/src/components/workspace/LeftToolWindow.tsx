/**
 * LeftToolWindow — 左侧 Tool Window 主区
 *
 * 设计(P8):
 *   - 主 tab(项目 / Git)由 ActivityBar 控制,本组件不再渲染
 *   - 项目 view:单层 header(剧本 标题 + 文件计数 + 刷新/新建 + view toggle 下拉
 *     切换 脚本/资产)+ 文件列表
 *   - Git view:GitPanel
 *   - 显示哪个 panel 由 store.activitySelection 决定
 */
import { useState } from 'react'
import { X, AppWindow, FilePlus, Folder, ImageIcon, ChevronDown } from 'lucide-react'
import { useUiStore } from '../../lib/store'
import { usePanelFloat } from '../../lib/hooks/use-panel-float'
import { ScriptFileTree } from '../../features/script-editor/ScriptFileTree'
import { AssetListPanel } from '../../features/asset/AssetListPanel'
import { GitPanel } from '../../features/git/GitPanel'
import { PlaceholderToolWindow } from './PlaceholderToolWindow'
import { Search, Bug, Settings } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { cn } from '../../lib/utils'

type ViewMode = 'files' | 'assets'

export const LeftToolWindow = (): JSX.Element => {
  const leftPanel = useUiStore((s) => s.leftPanel)
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel)
  const projectPath = useUiStore((s) => s.projectPath)
  const activitySelection = useUiStore((s) => s.activitySelection)

  const [viewMode, setViewMode] = useState<ViewMode>('files')
  const float = usePanelFloat()

  if (activitySelection === 'search') {
    return (
      <aside className="h-full flex flex-col bg-bg" data-testid="left-tool-window">
        <Header float={float} onClose={toggleLeftPanel} />
        <PlaceholderToolWindow icon={Search} title="搜索" description="跨文件全文搜索(即将支持)" />
      </aside>
    )
  }
  if (activitySelection === 'debug') {
    return (
      <aside className="h-full flex flex-col bg-bg" data-testid="left-tool-window">
        <Header float={float} onClose={toggleLeftPanel} />
        <PlaceholderToolWindow icon={Bug} title="调试" description="运行/断点/变量查看(即将支持)" />
      </aside>
    )
  }
  if (activitySelection === 'settings') {
    return (
      <aside className="h-full flex flex-col bg-bg" data-testid="left-tool-window">
        <Header float={float} onClose={toggleLeftPanel} />
        <PlaceholderToolWindow icon={Settings} title="设置" description="IDE 偏好配置(即将支持)" />
      </aside>
    )
  }

  const active = (leftPanel === 'closed' ? 'project' : leftPanel) as 'project' | 'git'

  return (
    <aside className="group h-full flex flex-col bg-bg" data-testid="left-tool-window">
      <Header float={float} onClose={toggleLeftPanel} />
      <div className="flex-1 overflow-hidden">
        {active === 'project' ? (
          <ProjectTab projectPath={projectPath} viewMode={viewMode} setViewMode={setViewMode} />
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

/**
 * ProjectTab — 单层 header:左侧标题 + 文件计数,右侧 view 切换下拉
 */
const ProjectTab = ({
  projectPath,
  viewMode,
  setViewMode
}: {
  projectPath: string | null
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
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
      <ProjectHeader viewMode={viewMode} setViewMode={setViewMode} />
      <div className="flex-1 overflow-auto">
        {viewMode === 'files' ? <ScriptFileTree /> : <AssetListPanel />}
      </div>
    </div>
  )
}

/**
 * ProjectHeader — 单层 header,带 view toggle 下拉
 * 文件 view:显示"剧本"标题 + 文件计数 + 刷新/新建
 * 资产 view:显示"资产"标题 + 占位
 */
const ProjectHeader = ({
  viewMode,
  setViewMode
}: {
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
}): JSX.Element => {
  const isFiles = viewMode === 'files'
  return (
    <div className="h-9 flex items-center bg-bg-elevated border-b border-border px-2.5 gap-1.5">
      {isFiles ? (
        <FilePlus className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
      ) : (
        <ImageIcon className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
      )}
      <span className="text-[13px] font-medium text-text">
        {isFiles ? '剧本' : '资产'}
      </span>
      <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
      <div className="flex-1" />
    </div>
  )
}

/**
 * ViewToggle — 右侧 view 切换下拉(脚本 / 资产)
 */
const ViewToggle = ({
  viewMode,
  setViewMode
}: {
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
}): JSX.Element => {
  const isFiles = viewMode === 'files'
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="切换 view"
          aria-label="切换 view"
          data-testid="view-toggle"
          className="h-6 px-1.5 rounded text-[11px] text-text-muted hover:text-text hover:bg-surface transition-colors flex items-center gap-0.5"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-32 p-1" sideOffset={4}>
        <button
          type="button"
          onClick={() => setViewMode('files')}
          className={cn(
            'w-full px-2 py-1.5 rounded text-[13px] flex items-center gap-2 transition-colors text-left',
            isFiles ? 'bg-accent-soft text-accent' : 'text-text hover:bg-bg-elevated'
          )}
        >
          <Folder className="w-3 h-3" />
          脚本
        </button>
        <button
          type="button"
          onClick={() => setViewMode('assets')}
          className={cn(
            'w-full px-2 py-1.5 rounded text-[13px] flex items-center gap-2 transition-colors text-left',
            !isFiles ? 'bg-accent-soft text-accent' : 'text-text hover:bg-bg-elevated'
          )}
        >
          <ImageIcon className="w-3 h-3" />
          资产
        </button>
      </PopoverContent>
    </Popover>
  )
}

