/**
 * command-registry — 命令注册表 + 快捷键解析(P0/P1:统一命令真相源)
 *
 * 设计:
 *   - 所有可绑快捷键的命令在此登记,带默认 accelerator + 分类 + 图标(单一真相源)
 *   - 偏好面板(ShortcutsPreferencesPanel)展示此表;键盘 hook 读"用户覆盖 ?? 默认"
 *   - 命令面板/菜单经 dispatcher 调用,标签+快捷键+动作三处不再各写一遍
 *   - accelerator 格式与 use-shortcut-recorder 输出一致:'Ctrl+Meta+Shift+K'
 *     修饰键 Ctrl/Meta/Alt/Shift(首字母大写)+ 末尾主键(e.key 原值)
 */
import {
  Sparkles,
  FileText,
  Settings,
  FilePlus,
  Plus,
  FolderOpen,
  GitCommit,
  Download,
  PanelLeft,
  GitBranch,
  List,
  Users,
  MessageSquare,
  Undo2,
  Redo2,
  XCircle,
  Eye,
  type LucideIcon
} from 'lucide-react'

/** 用原生 KeyboardEvent(键盘 hook 监听的是 window keydown,非 React 合成事件) */
type KeyEvent = {
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  key: string
}

export type CommandCategory = 'go' | 'project' | 'file' | 'edit' | 'view'

export type CommandId =
  | 'commandPalette'
  | 'goToFile'
  | 'openPreferences'
  | 'newScriptFile'
  | 'newProject'
  | 'openProject'
  | 'closeProject'
  | 'commit'
  | 'export'
  | 'toggleLeftPanel'
  | 'showGit'
  | 'showOutline'
  | 'showCharacter'
  | 'showAi'
  | 'toggleAi'
  | 'togglePreview'
  | 'undo'
  | 'redo'

export type CommandDef = {
  id: CommandId
  label: string
  /** 默认 accelerator;null = 该命令默认无快捷键(仅可手动绑定) */
  default: string | null
  category: CommandCategory
  icon: LucideIcon
  /** true = 仅在打开项目时可用(影响菜单/快捷键是否需要 projectPath 守卫) */
  requiresProject?: boolean
}

/** 命令 → 默认 accelerator + 分类 + 图标(单一真相源) */
export const COMMANDS: readonly CommandDef[] = [
  { id: 'commandPalette', label: '命令面板', default: 'Meta+K', category: 'go', icon: Sparkles },
  { id: 'goToFile', label: '跳转到文件', default: 'Meta+P', category: 'go', icon: FileText },
  { id: 'openPreferences', label: '偏好设置', default: 'Meta+,', category: 'view', icon: Settings },
  {
    id: 'newScriptFile',
    label: '新建剧本文件',
    default: 'Meta+N',
    category: 'file',
    icon: FilePlus
  },
  { id: 'newProject', label: '新建项目', default: 'Meta+Shift+N', category: 'project', icon: Plus },
  {
    id: 'openProject',
    label: '打开项目',
    default: 'Meta+O',
    category: 'project',
    icon: FolderOpen
  },
  {
    id: 'closeProject',
    label: '关闭项目',
    default: null,
    category: 'project',
    icon: XCircle,
    requiresProject: true
  },
  {
    id: 'commit',
    label: 'Git 提交',
    default: 'Meta+Shift+C',
    category: 'file',
    icon: GitCommit,
    requiresProject: true
  },
  {
    id: 'export',
    label: '导出',
    default: 'Meta+E',
    category: 'file',
    icon: Download,
    requiresProject: true
  },
  {
    id: 'toggleLeftPanel',
    label: '切换左面板',
    default: 'Meta+1',
    category: 'view',
    icon: PanelLeft
  },
  { id: 'showGit', label: '显示 Git 面板', default: 'Meta+2', category: 'view', icon: GitBranch },
  { id: 'showOutline', label: '显示大纲面板', default: 'Meta+3', category: 'view', icon: List },
  {
    id: 'showCharacter',
    label: '显示角色面板',
    default: 'Meta+4',
    category: 'view',
    icon: Users
  },
  { id: 'showAi', label: '显示 AI 面板', default: 'Meta+5', category: 'view', icon: MessageSquare },
  {
    id: 'toggleAi',
    label: '切换 AI 助手',
    default: null,
    category: 'view',
    icon: MessageSquare,
    requiresProject: true
  },
  {
    id: 'togglePreview',
    label: '运行预览',
    default: 'F5',
    category: 'view',
    icon: Eye,
    requiresProject: true
  },
  { id: 'undo', label: '撤销', default: 'Meta+Z', category: 'edit', icon: Undo2 },
  { id: 'redo', label: '重做', default: 'Meta+Shift+Z', category: 'edit', icon: Redo2 }
]

export const DEFAULT_SHORTCUTS: Record<CommandId, string | null> = Object.fromEntries(
  COMMANDS.map((c) => [c.id, c.default])
) as Record<CommandId, string | null>

export const COMMAND_BY_ID: Record<CommandId, CommandDef> = Object.fromEntries(
  COMMANDS.map((c) => [c.id, c])
) as Record<CommandId, CommandDef>

export const COMMAND_LABELS: Record<CommandId, string> = Object.fromEntries(
  COMMANDS.map((c) => [c.id, c.label])
) as Record<CommandId, string>

/** 分类中文标题(命令面板分组用) */
export const CATEGORY_LABELS: Record<CommandCategory, string> = {
  go: '跳转与命令',
  project: '项目',
  file: '文件',
  edit: '编辑',
  view: '视图'
}

/** 分类展示顺序 */
export const CATEGORY_ORDER: readonly CommandCategory[] = ['project', 'file', 'edit', 'view', 'go']

/**
 * 解析 accelerator 字符串为结构化修饰键 + 主键。
 * 格式:'Ctrl+Meta+Shift+K' → { ctrl, meta, alt, shift, key: 'K' }
 */
type Parsed = { ctrl: boolean; meta: boolean; alt: boolean; shift: boolean; key: string }

const MODIFIERS = new Set(['Ctrl', 'Meta', 'Alt', 'Shift'])

export const parseAccelerator = (acc: string): Parsed | null => {
  const parts = acc.split('+')
  if (parts.length === 0) return null
  const key = parts[parts.length - 1]
  if (!key) return null
  let ctrl = false
  let meta = false
  let alt = false
  let shift = false
  for (let i = 0; i < parts.length - 1; i++) {
    const m = parts[i]
    if (m === 'Ctrl') ctrl = true
    else if (m === 'Meta') meta = true
    else if (m === 'Alt') alt = true
    else if (m === 'Shift') shift = true
    else return null // 非法修饰键
  }
  return { ctrl, meta, alt, shift, key }
}

void MODIFIERS

/** 主键匹配:accelerator 里的 key 与 KeyboardEvent 的 key 对比(大小写不敏感) */
const keyMatches = (accKey: string, eventKey: string): boolean => {
  // accelerator 存的是 e.key 原值(如 ',', 'P', 'F5');大小写不敏感比较字母
  return accKey.toLowerCase() === eventKey.toLowerCase()
}

/**
 * 判定 KeyboardEvent 是否命中某 accelerator。
 * 修饰键要求精确匹配(有则必须按,无则不能按),主键大小写不敏感。
 */
export const acceleratorMatches = (acc: string, e: KeyEvent): boolean => {
  const p = parseAccelerator(acc)
  if (!p) return false
  const ctrl = e.ctrlKey
  const meta = e.metaKey
  const alt = e.altKey
  const shift = e.shiftKey
  return (
    p.ctrl === ctrl &&
    p.meta === meta &&
    p.alt === alt &&
    p.shift === shift &&
    keyMatches(p.key, e.key)
  )
}

/**
 * 计算某命令的有效 accelerator:用户覆盖优先,否则默认;两者皆空返回 null/undefined。
 * 用户存的是 `Record<string,string>`,空对象/缺失 = 用默认。
 */
export const effectiveShortcut = (
  id: CommandId,
  userShortcuts: Record<string, string> | undefined
): string | null => {
  const user = userShortcuts?.[id]
  if (user && user.trim() !== '') return user
  return DEFAULT_SHORTCUTS[id]
}

/** accelerator → 人类可读快捷键标签(菜单/面板显示用),如 'Meta+K' → '⌘K' */
export const acceleratorLabel = (acc: string | null | undefined): string | null => {
  if (!acc) return null
  return acc
    .replace('Meta', '⌘')
    .replace('Shift', '⇧')
    .replace('Alt', '⌥')
    .replace('Ctrl', '⌃')
    .replace(/\+/g, '')
}
