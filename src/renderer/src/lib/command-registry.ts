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
  PanelRight,
  PanelBottom,
  GitBranch,
  List,
  Users,
  Brain,
  MessageSquare,
  Undo2,
  Redo2,
  XCircle,
  Eye,
  Search,
  Save,
  SunMoon,
  PenLine,
  Workflow,
  SearchCheck,
  PictureInPicture2,
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
  | 'showBrain'
  | 'showCharacter'
  | 'showAi'
  | 'toggleAi'
  | 'togglePreview'
  | 'undo'
  | 'redo'
  | 'find'
  | 'saveScript'
  | 'toggleTheme'
  | 'presetWriting'
  | 'presetFlow'
  | 'presetReview'
  | 'aiDockLeft'
  | 'aiDockRight'
  | 'aiDockBottom'
  | 'floatAi'

export type CommandDef = {
  id: CommandId
  label: string
  /** 默认 accelerator;null = 该命令默认无快捷键(仅可手动绑定) */
  default: string | null
  category: CommandCategory
  icon: LucideIcon
  /** true = 仅在打开项目时可用(影响菜单/快捷键是否需要 projectPath 守卫) */
  requiresProject?: boolean
  /** 搜索关键词(中英双语),命令面板模糊匹配用 */
  keywords?: string[]
}

/** 命令 → 默认 accelerator + 分类 + 图标(单一真相源) */
export const COMMANDS: readonly CommandDef[] = [
  {
    id: 'commandPalette',
    label: '命令面板',
    default: 'Meta+K',
    category: 'go',
    icon: Sparkles,
    keywords: ['命令面板', 'command palette', 'palette']
  },
  {
    id: 'goToFile',
    label: '跳转到文件',
    default: 'Meta+P',
    category: 'go',
    icon: FileText,
    keywords: ['跳转文件', '跳转到文件', '文件', 'go to file', 'open file']
  },
  {
    id: 'openPreferences',
    label: '偏好设置',
    default: 'Meta+,',
    category: 'view',
    icon: Settings,
    keywords: ['偏好', '设置', 'preferences', 'settings']
  },
  {
    id: 'newScriptFile',
    label: '新建剧本文件',
    default: 'Meta+N',
    category: 'file',
    icon: FilePlus,
    keywords: ['新建剧本', '新建文件', '剧本', 'new script', 'new file']
  },
  {
    id: 'newProject',
    label: '新建项目',
    default: 'Meta+Shift+N',
    category: 'project',
    icon: Plus,
    keywords: ['新建项目', 'new project', 'create project']
  },
  {
    id: 'openProject',
    label: '打开项目',
    default: 'Meta+O',
    category: 'project',
    icon: FolderOpen,
    keywords: ['打开项目', 'open project']
  },
  {
    id: 'closeProject',
    label: '关闭项目',
    default: null,
    category: 'project',
    icon: XCircle,
    requiresProject: true,
    keywords: ['关闭项目', 'close project']
  },
  {
    id: 'commit',
    label: 'Git 提交',
    default: 'Meta+Shift+C',
    category: 'file',
    icon: GitCommit,
    requiresProject: true,
    keywords: ['提交', 'git 提交', 'git commit', 'commit']
  },
  {
    id: 'export',
    label: '导出',
    default: 'Meta+E',
    category: 'file',
    icon: Download,
    requiresProject: true,
    keywords: ['导出', '发布', 'export', 'publish']
  },
  {
    id: 'toggleLeftPanel',
    label: '切换左面板',
    default: 'Meta+1',
    category: 'view',
    icon: PanelLeft,
    keywords: ['左面板', '项目面板', '侧栏', 'toggle left panel', 'project panel', 'sidebar']
  },
  {
    id: 'showGit',
    label: '显示 Git 面板',
    default: 'Meta+2',
    category: 'view',
    icon: GitBranch,
    keywords: ['git', 'git 面板', '版本控制', 'source control']
  },
  {
    id: 'showBrain',
    label: '显示项目大脑面板',
    default: 'Meta+6',
    category: 'view',
    icon: Brain,
    keywords: ['大脑', '伏笔', 'brain', 'foreshadowing', '一致性']
  },
  {
    id: 'showOutline',
    label: '显示大纲面板',
    default: 'Meta+3',
    category: 'view',
    icon: List,
    keywords: ['大纲', '结构', 'outline', 'structure']
  },
  {
    id: 'showCharacter',
    label: '显示角色面板',
    default: 'Meta+4',
    category: 'view',
    icon: Users,
    keywords: ['角色', '角色面板', 'character', 'characters']
  },
  {
    id: 'showAi',
    label: '显示 AI 面板',
    default: 'Meta+5',
    category: 'view',
    icon: MessageSquare,
    keywords: ['ai', 'ai 面板', '助手', 'assistant']
  },
  {
    id: 'toggleAi',
    label: '切换 AI 助手',
    default: 'Meta+L',
    category: 'view',
    icon: MessageSquare,
    requiresProject: true,
    keywords: ['ai 助手', '切换 ai', 'toggle ai', 'assistant', 'copilot']
  },
  {
    id: 'togglePreview',
    label: '运行预览',
    default: 'F5',
    category: 'view',
    icon: Eye,
    requiresProject: true,
    keywords: ['预览', '运行', 'preview', 'run', 'play', 'f5']
  },
  {
    id: 'undo',
    label: '撤销',
    default: 'Meta+Z',
    category: 'edit',
    icon: Undo2,
    keywords: ['撤销', 'undo']
  },
  {
    id: 'redo',
    label: '重做',
    default: 'Meta+Shift+Z',
    category: 'edit',
    icon: Redo2,
    keywords: ['重做', 'redo']
  },
  {
    id: 'find',
    label: '查找',
    default: 'Meta+F',
    category: 'edit',
    icon: Search,
    keywords: ['查找', '搜索', 'find', 'search']
  },
  {
    id: 'saveScript',
    label: '保存剧本',
    default: 'Meta+S',
    category: 'file',
    icon: Save,
    requiresProject: true,
    keywords: ['保存', '保存剧本', 'save', 'save script']
  },
  {
    id: 'toggleTheme',
    label: '切换主题',
    default: null,
    category: 'view',
    icon: SunMoon,
    keywords: ['主题', '深色', '浅色', 'theme', 'dark mode', 'light mode']
  },
  {
    id: 'presetWriting',
    label: '工作区: 写作',
    default: null,
    category: 'view',
    icon: PenLine,
    keywords: ['工作区', '写作', '布局', 'workspace', 'writing', 'layout']
  },
  {
    id: 'presetFlow',
    label: '工作区: 流程',
    default: null,
    category: 'view',
    icon: Workflow,
    keywords: ['工作区', '流程', '布局', 'workspace', 'flow', 'layout']
  },
  {
    id: 'presetReview',
    label: '工作区: 评审',
    default: null,
    category: 'view',
    icon: SearchCheck,
    keywords: ['工作区', '评审', '布局', 'workspace', 'review', 'layout']
  },
  {
    id: 'aiDockLeft',
    label: 'AI 移到左侧',
    default: null,
    category: 'view',
    icon: PanelLeft,
    keywords: ['ai 左侧', 'ai 停靠', '移动 ai', 'dock left', 'move ai']
  },
  {
    id: 'aiDockRight',
    label: 'AI 移到右侧',
    default: null,
    category: 'view',
    icon: PanelRight,
    keywords: ['ai 右侧', 'ai 停靠', '移动 ai', 'dock right', 'move ai']
  },
  {
    id: 'aiDockBottom',
    label: 'AI 移到底部',
    default: null,
    category: 'view',
    icon: PanelBottom,
    keywords: ['ai 底部', 'ai 停靠', '移动 ai', 'dock bottom', 'move ai']
  },
  {
    id: 'floatAi',
    label: 'AI 浮出',
    default: null,
    category: 'view',
    icon: PictureInPicture2,
    keywords: ['浮出', '独立窗口', 'float', 'detach', 'pop out']
  }
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
