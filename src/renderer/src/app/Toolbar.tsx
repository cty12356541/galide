/**
 * Toolbar — 工具条
 *
 * 设计:
 *   - 项目名 + 面包屑(当前文件路径)
 *   - 核心操作按钮:导出 / Git / AI 开关 / 主题切换 / 偏好
 *   - 与 MenuBar 区分:MenuBar 是应用菜单(下拉),Toolbar 是常用按钮
 *   - tooltip 与点击均走命令注册表:title = 命令 label + acceleratorLabel(有效快捷键),
 *     onClick 经 dispatchCommand 投递,与菜单/命令面板/快捷键同一条执行路径
 */
import { Download, GitCommit, Settings, Moon, Sun, Sparkles, FolderOpen, ChevronRight } from 'lucide-react'
import { Button } from '../components/ui/button'
import { useUiStore } from '../lib/store'
import {
  acceleratorLabel,
  effectiveShortcut,
  COMMAND_LABELS,
  type CommandId
} from '../lib/command-registry'
import { useCommandDispatcher } from '../lib/hooks/use-command-dispatcher'

export const Toolbar = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const projectName = useUiStore((s) => s.projectName)
  const activeScriptFile = useUiStore((s) => s.activeScriptFile)
  const aiPanelOpen = useUiStore((s) => s.visiblePerSide[s.dockSide.ai] === 'ai')
  const theme = useUiStore((s) => s.theme)
  const resolvedShortcuts = useUiStore((s) => s.resolvedShortcuts)
  const { dispatchCommand } = useCommandDispatcher()

  /** 命令 tooltip:注册表 label + 有效快捷键展示标签(未绑定则仅 label) */
  const commandTitle = (id: CommandId): string => {
    // resolvedShortcuts 已由 useResolvedShortcutsSync 解析为有效 accelerator;未同步时回退默认
    const acc = resolvedShortcuts[id] ?? effectiveShortcut(id, undefined)
    const hint = acceleratorLabel(acc)
    return hint ? `${COMMAND_LABELS[id]} (${hint})` : COMMAND_LABELS[id]
  }

  return (
    <header
      aria-label="Toolbar"
      className="h-10 bg-bg-elevated border-b border-border flex items-center px-2.5 gap-2 flex-shrink-0"
      data-testid="toolbar"
    >
      {projectPath ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[13px] font-medium truncate" title={projectPath}>
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void dispatchCommand('openProject')}
          title={commandTitle('openProject')}
        >
         <FolderOpen className="w-3.5 h-3.5 mr-1" />
         打开项目
       </Button>
      )}

      <div className="flex-1" />

      {projectPath ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void dispatchCommand('commit')}
            title={commandTitle('commit')}
          >
            <GitCommit className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void dispatchCommand('export')}
            title={commandTitle('export')}
          >
            <Download className="w-4 h-4" />
          </Button>
        </>
      ) : null}

      <Button
        variant={aiPanelOpen ? 'default' : 'ghost'}
        size="sm"
        onClick={() => void dispatchCommand('toggleAi')}
        title={commandTitle('toggleAi')}
        data-testid="toolbar-ai-toggle"
      >
        <Sparkles className="w-4 h-4" />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => void dispatchCommand('toggleTheme')}
        title={commandTitle('toggleTheme')}
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => void dispatchCommand('openPreferences')}
        title={commandTitle('openPreferences')}
      >
        <Settings className="w-4 h-4" />
      </Button>
    </header>
  )
}
