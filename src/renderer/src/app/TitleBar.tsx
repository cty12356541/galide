import { Sun, Moon, Sparkles, MessageSquare, Settings as SettingsIcon, XCircle, Download, GitCommit } from 'lucide-react'
import { Button } from '../components/ui/button'
import { useUiStore } from '../lib/store'
import { Separator } from '../components/ui/separator'

export const TitleBar = (): JSX.Element => {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const aiPanelOpen = useUiStore((s) => s.aiPanelOpen)
  const toggleAi = useUiStore((s) => s.toggleAiPanel)
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette)
  const openPreferences = useUiStore((s) => s.openPreferences)
  const openExportDialog = useUiStore((s) => s.openExportDialog)
  const openCommitDialog = useUiStore((s) => s.openCommitDialog)
  const projectPath = useUiStore((s) => s.projectPath)
  const closeProject = useUiStore((s) => s.closeProject)

  return (
    <div
      className="h-11 bg-surface border-b border-border flex items-center justify-between px-4 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-lg bg-accent flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-sm font-semibold text-text">Galide</span>
      </div>
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Button variant="ghost" size="sm" onClick={() => toggleCommandPalette()}>
          <span className="text-xs text-text-muted mr-1">⌘K</span>
          <span className="text-xs">命令</span>
        </Button>
        <Separator orientation="vertical" className="h-5 mx-1" />
        <Button
          variant={aiPanelOpen ? 'default' : 'ghost'}
          size="icon"
          onClick={() => toggleAi()}
          title="AI 助手"
        >
          <MessageSquare className="w-4 h-4" />
        </Button>
        {projectPath && (
          <>
            <Button variant="ghost" size="icon" onClick={() => openCommitDialog()} title="Git 提交">
              <GitCommit className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => openExportDialog()} title="导出项目">
              <Download className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (window.confirm('关闭当前项目?未保存改动请先保存。')) closeProject()
              }}
              title="关闭项目"
            >
              <XCircle className="w-4 h-4" />
            </Button>
          </>
        )}
        <Button variant="ghost" size="icon" onClick={() => openPreferences()} title="偏好设置">
          <SettingsIcon className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="切换主题">
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  )
}
