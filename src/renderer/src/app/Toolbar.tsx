/**
 * Toolbar — 工具条
 *
 * 设计:
 *   - 项目名 + 面包屑(当前文件路径)
 *   - 核心操作按钮:导出 / Git / AI 开关 / 主题切换 / 偏好
 *   - 与 MenuBar 区分:MenuBar 是应用菜单(下拉),Toolbar 是常用按钮
 */
import { Download, GitCommit, Settings, Moon, Sun, Sparkles, FolderOpen, ChevronRight } from 'lucide-react'
import { Button } from '../components/ui/button'
import { useUiStore } from '../lib/store'

export const Toolbar = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const projectName = useUiStore((s) => s.projectName)
  const activeScriptFile = useUiStore((s) => s.activeScriptFile)
  const aiPanelOpen = useUiStore((s) => s.aiPanelOpen)
  const toggleAiPanel = useUiStore((s) => s.toggleAiPanel)
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const openPreferences = useUiStore((s) => s.openPreferences)
  const openExportDialog = useUiStore((s) => s.openExportDialog)
  const openCommitDialog = useUiStore((s) => s.openCommitDialog)

  return (
    <header
      aria-label="Toolbar"
      className="h-10 bg-surface border-b border-border flex items-center px-2 gap-2 flex-shrink-0"
      data-testid="toolbar"
    >
      {projectPath ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium truncate" title={projectPath}>
            {projectName ?? '未命名项目'}
          </span>
          {activeScriptFile ? (
            <>
              <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />
              <span className="text-xs text-text-muted truncate">{activeScriptFile}</span>
            </>
          ) : null}
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('galide:open-project'))}>
          <FolderOpen className="w-3.5 h-3.5 mr-1" />
          打开项目
        </Button>
      )}

      <div className="flex-1" />

      {projectPath ? (
        <>
          <Button variant="ghost" size="sm" onClick={openCommitDialog} title="Git 提交 (⌘⇧C)">
            <GitCommit className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={openExportDialog} title="导出 (⌘E)">
            <Download className="w-3.5 h-3.5" />
          </Button>
        </>
      ) : null}

      <Button
        variant={aiPanelOpen ? 'default' : 'ghost'}
        size="sm"
        onClick={toggleAiPanel}
        title="AI 助手 (⌘L)"
        data-testid="toolbar-ai-toggle"
      >
        <Sparkles className="w-3.5 h-3.5" />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title="切换主题"
      >
        {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
      </Button>

      <Button variant="ghost" size="sm" onClick={() => openPreferences()} title="偏好 (⌘,)">
        <Settings className="w-3.5 h-3.5" />
      </Button>
    </header>
  )
}
