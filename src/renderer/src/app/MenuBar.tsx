/**
 * MenuBar — 应用菜单(命令注册表驱动)
 *
 * 设计:
 *   - 菜单组 = 命令注册表分类:顺序经 CATEGORY_ORDER,标题经 CATEGORY_LABELS(单一真相源)
 *   - 菜单项全部来自 COMMANDS:label/icon 取自注册表;快捷键标签 =
 *     acceleratorLabel(resolvedShortcuts[id] ?? effectiveShortcut(id, undefined)),
 *     与 Toolbar 同一消费模式,无任何硬编码快捷键字符串
 *   - 点击一律经 useCommandDispatcher 的 dispatchCommand(id) 投递,
 *     与键盘 hook / Toolbar / 命令面板同一条执行路径
 *   - requiresProject 项在无项目时隐藏(与 CommandPalette 的 projectPath 门控一致)
 *   - 工作区 preset 项保留 active 高亮(presentation 映射,注册表无此概念)
 *   - 用 Radix Popover 实现下拉(结构/样式不变)
 */
import { useState } from 'react'
import {
  Folder,
  FileText,
  Edit3,
  Eye,
  Sparkles,
  HelpCircle,
  ChevronDown,
  type LucideIcon
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover'
import { useUiStore, type WorkspacePresetId } from '../lib/store'
import { useCommandDispatcher } from '../lib/hooks/use-command-dispatcher'
import {
  COMMANDS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  acceleratorLabel,
  effectiveShortcut,
  type CommandCategory,
  type CommandId
} from '../lib/command-registry'
import { cn } from '../lib/utils'

/** 菜单组标题图标(组级 chrome,注册表只含命令级图标) */
const GROUP_ICONS: Record<CommandCategory | 'help', LucideIcon> = {
  project: Folder,
  file: FileText,
  edit: Edit3,
  view: Eye,
  go: Sparkles,
  help: HelpCircle
}

/** preset 命令 → preset id(active 高亮用;注册表不含此展示状态) */
const PRESET_COMMANDS: Partial<Record<CommandId, WorkspacePresetId>> = {
  presetWriting: 'writing',
  presetFlow: 'flow',
  presetReview: 'review'
}

type MenuItemSpec = {
  key: string
  label: string
  shortcut?: string | null
  icon?: LucideIcon
  onClick: () => void
  active?: boolean
}

type MenuGroup = {
  key: string
  label: string
  icon: LucideIcon
  items: MenuItemSpec[]
}

export const MenuBar = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const workspacePreset = useUiStore((s) => s.workspacePreset)
  const resolvedShortcuts = useUiStore((s) => s.resolvedShortcuts)
  const { dispatchCommand } = useCommandDispatcher()

  const groups: MenuGroup[] = CATEGORY_ORDER.map((category) => ({
    key: category,
    label: CATEGORY_LABELS[category],
    icon: GROUP_ICONS[category],
    items: COMMANDS.filter(
      (cmd) => cmd.category === category && (!cmd.requiresProject || projectPath)
    ).map((cmd) => ({
      key: cmd.id,
      label: cmd.label,
      icon: cmd.icon,
      // resolvedShortcuts 已由 useResolvedShortcutsSync 解析为有效 accelerator;未同步时回退默认
      shortcut: acceleratorLabel(resolvedShortcuts[cmd.id] ?? effectiveShortcut(cmd.id, undefined)),
      onClick: () => void dispatchCommand(cmd.id),
      active: PRESET_COMMANDS[cmd.id] === workspacePreset
    }))
  }))

  // 帮助组:非注册表内容。「关于 Galide」是外部 URL,刻意不作为注册表命令,保留为普通链接项
  groups.push({
    key: 'help',
    label: '帮助',
    icon: GROUP_ICONS.help,
    items: [
      {
        key: 'about',
        label: '关于 Galide',
        onClick: () => window.open('https://github.com/galide', '_blank')
      }
    ]
  })

  return (
    <nav
      aria-label="Menu Bar"
      className="h-9 bg-surface border-b border-border flex items-center px-1.5 gap-0.5 flex-shrink-0"
      data-testid="menu-bar"
    >
      {groups.map(({ key, label, icon: Icon, items }) => (
        <MenuDropdown key={key} groupKey={key} label={label} icon={Icon} items={items} />
      ))}
      <div className="flex-1" />
      <span className={cn('text-[11px] text-text-muted px-2 font-medium')} data-testid="workspace-preset-label">
        {workspacePreset === 'writing' ? '✍️ 写作' : workspacePreset === 'flow' ? '🌊 流程' : '🔍 评审'}
      </span>
    </nav>
  )
}

const MenuDropdown = ({
  groupKey,
  label,
  icon: Icon,
  items
}: {
  groupKey: string
  label: string
  icon: LucideIcon
  items: MenuItemSpec[]
}): JSX.Element => {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'h-7 px-3 text-[13px] font-medium rounded flex items-center gap-1 transition-colors',
            open ? 'bg-bg-elevated text-text' : 'text-text-muted hover:bg-bg-elevated hover:text-text'
          )}
          data-testid={`menu-${groupKey}`}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
          <ChevronDown className="w-2.5 h-2.5 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1" sideOffset={4}>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              item.onClick()
              setOpen(false)
            }}
            className={cn(
              'w-full px-2.5 py-1.5 rounded text-[13px] flex items-center gap-2 transition-colors text-left',
              item.active ? 'bg-accent-soft text-accent' : 'text-text hover:bg-bg-elevated'
            )}
            data-testid={`menu-item-${groupKey}-${item.key}`}
          >
            {item.icon ? <item.icon className="w-3.5 h-3.5 flex-shrink-0" /> : <span className="w-3.5" />}
            <span className="flex-1">{item.label}</span>
            {item.shortcut ? <span className="text-text-muted text-[11px] font-mono">{item.shortcut}</span> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
