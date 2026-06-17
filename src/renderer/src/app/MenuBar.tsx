/**
 * MenuBar — 应用菜单(File / Edit / View / Run / Help)
 *
 * 设计:
 *   - 横向菜单条,点击展开下拉
 *   - 用 Radix Popover 实现下拉(简单 + 已有依赖)
 *   - 暴露核心操作:新建/打开/关闭项目、导出、Git 提交、偏好
 *   - View 菜单:工作区切换 + Tool Window 开关 + AI 移动
 */
import { useState } from 'react'
import { FileText, Edit3, Eye, Wrench, HelpCircle, Plus, Folder, Settings, Download, GitCommit, Sparkles, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover'
import { useUiStore, type WorkspacePresetId } from '../lib/store'
import { cn } from '../lib/utils'

type MenuItemSpec = {
  label: string
  shortcut?: string
  icon?: typeof Plus
  onClick: () => void
  separatorAfter?: boolean
  active?: boolean
}

type MenuGroup = {
  label: string
  icon: typeof FileText
  items: MenuItemSpec[]
}

export const MenuBar = (): JSX.Element => {
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette)
  const openPreferences = useUiStore((s) => s.openPreferences)
  const openNewProjectDialog = useUiStore((s) => s.openNewProjectDialog)
  const openExportDialog = useUiStore((s) => s.openExportDialog)
  const openCommitDialog = useUiStore((s) => s.openCommitDialog)
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel)
  const toggleAiPanel = useUiStore((s) => s.toggleAiPanel)
  const setWorkspacePreset = useUiStore((s) => s.setWorkspacePreset)
  const workspacePreset = useUiStore((s) => s.workspacePreset)
  const setAiDockedLocation = useUiStore((s) => s.setAiDockedLocation)
  const closeProject = useUiStore((s) => s.closeProject)

  const groups: MenuGroup[] = [
    {
      label: 'File',
      icon: FileText,
      items: [
        { label: '新建项目', shortcut: '⌘N', icon: Plus, onClick: openNewProjectDialog },
        { label: '打开项目', shortcut: '⌘O', icon: Folder, onClick: () => window.dispatchEvent(new CustomEvent('galide:open-project')) },
        { label: '关闭项目', icon: Folder, onClick: closeProject, separatorAfter: true },
        { label: '导出', shortcut: '⌘E', icon: Download, onClick: openExportDialog },
        { label: 'Git 提交', shortcut: '⌘⇧C', icon: GitCommit, onClick: openCommitDialog, separatorAfter: true },
        { label: '偏好', shortcut: '⌘,', icon: Settings, onClick: () => openPreferences() }
      ]
    },
    {
      label: 'Edit',
      icon: Edit3,
      items: [
        { label: '撤销', shortcut: '⌘Z', onClick: () => document.execCommand('undo') },
        { label: '重做', shortcut: '⌘⇧Z', onClick: () => document.execCommand('redo') },
        { label: '查找', shortcut: '⌘F', onClick: () => window.dispatchEvent(new CustomEvent('galide:find')) },
        { label: '命令面板', shortcut: '⌘K', icon: Sparkles, onClick: () => toggleCommandPalette(true) }
      ]
    },
    {
      label: 'View',
      icon: Eye,
      items: [
        { label: '工作区: 写作', onClick: () => setWorkspacePreset('writing' as WorkspacePresetId), active: workspacePreset === 'writing' },
        { label: '工作区: 流程', onClick: () => setWorkspacePreset('flow' as WorkspacePresetId), active: workspacePreset === 'flow' },
        { label: '工作区: 评审', onClick: () => setWorkspacePreset('review' as WorkspacePresetId), active: workspacePreset === 'review', separatorAfter: true },
        { label: '项目 Tool Window', shortcut: '⌘1', onClick: toggleLeftPanel },
        { label: 'AI Tool Window', shortcut: '⌘L', onClick: toggleAiPanel, separatorAfter: true },
        { label: 'AI 移到右侧', onClick: () => setAiDockedLocation('right') },
        { label: 'AI 移到底部', onClick: () => setAiDockedLocation('bottom') },
        { label: 'AI 浮出', onClick: () => setAiDockedLocation('floating') }
      ]
    },
    {
      label: 'Run',
      icon: Wrench,
      items: [
        { label: '运行预览', shortcut: 'F5', onClick: () => setWorkspacePreset('review' as WorkspacePresetId) },
        { label: '导出 Web', onClick: openExportDialog }
      ]
    },
    {
      label: 'Help',
      icon: HelpCircle,
      items: [
        { label: '关于 Galide', onClick: () => window.open('https://github.com/galide', '_blank') }
      ]
    }
  ]

  return (
    <nav
      aria-label="Menu Bar"
      className="h-8 bg-surface border-b border-border flex items-center px-1 gap-0.5 flex-shrink-0"
      data-testid="menu-bar"
    >
      {groups.map(({ label, icon: Icon, items }) => (
        <MenuDropdown key={label} label={label} icon={Icon} items={items} />
      ))}
      <div className="flex-1" />
      <span className={cn('text-[10px] text-text-muted px-2')} data-testid="workspace-preset-label">
        {workspacePreset === 'writing' ? '✍️ 写作' : workspacePreset === 'flow' ? '🌊 流程' : '🔍 评审'}
      </span>
    </nav>
  )
}

const MenuDropdown = ({
  label,
  icon: Icon,
  items
}: {
  label: string
  icon: typeof FileText
  items: MenuItemSpec[]
}): JSX.Element => {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'h-6 px-2.5 text-xs rounded flex items-center gap-1 transition-colors',
            open ? 'bg-bg-elevated text-text' : 'text-text-muted hover:bg-bg-elevated hover:text-text'
          )}
          data-testid={`menu-${label.toLowerCase()}`}
        >
          <Icon className="w-3 h-3" />
          {label}
          <ChevronDown className="w-2.5 h-2.5 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1" sideOffset={4}>
        {items.map((item) => (
          <div key={item.label}>
            <button
              type="button"
              onClick={() => {
                item.onClick()
                setOpen(false)
              }}
              className={cn(
                'w-full px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors text-left',
                item.active ? 'bg-accent-soft text-accent' : 'text-text hover:bg-bg-elevated'
              )}
              data-testid={`menu-item-${label.toLowerCase()}-${item.label}`}
            >
              {item.icon ? <item.icon className="w-3.5 h-3.5 flex-shrink-0" /> : <span className="w-3.5" />}
              <span className="flex-1">{item.label}</span>
              {item.shortcut ? <span className="text-text-muted text-[10px]">{item.shortcut}</span> : null}
            </button>
            {item.separatorAfter ? <div className="h-px bg-border my-1" /> : null}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}
