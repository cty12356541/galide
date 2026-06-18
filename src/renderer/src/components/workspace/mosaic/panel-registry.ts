/**
 * Panel Registry — 功能即岛 v2(主岛/子岛二级群岛 + 编辑器大陆)
 *
 * 严格分层(PyCharm 风格):
 *   - EditorDocId:中心编辑器大陆(script/flow/preview),进 mosaic 树,非「岛」
 *   - ToolWindowId:主岛(可 dock 左/右/底,可整座浮出)
 *   - SubIslandId:主岛内子岛(多子岛主岛有 tab 条,子岛可单独脱离)
 *
 * 语义归并:
 *   - project 主岛 = 脚本树(scripts) + 资产(assets)
 *   - character 主岛 = 角色档案(profiles) + 语音(voice)
 *   - git / outline / ai 各为单子岛主岛(无 tab,整主岛浮出)
 *
 * id 空间无歧义:单子岛主岛(git/outline/ai)的子岛 id 与主岛 id 同名,
 * 但子岛从不单独浮出(单子岛 header 直接浮出整主岛),故浮出空间中
 * 'git'/'outline'/'ai' 永远指主岛。getFloatingContent 先判 ToolWindowId。
 */
import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import { FileText, GitBranch, Box, Folder, Sparkles, ListTree, Users, Mic, Image } from 'lucide-react'
import { ScriptEditor } from '../../../features/script-editor/ScriptEditor'
import { FlowView } from '../../../features/flow-view/FlowView'
import { PreviewCanvas } from '../../../features/preview/PreviewCanvas'
import { ScriptFileTree } from '../../../features/script-editor/ScriptFileTree'
import { GitPanel } from '../../../features/git/GitPanel'
import { OutlinePanel } from '../../../features/outline/OutlinePanel'
import { CharacterListPanel } from '../../../features/character/CharacterListPanel'
import { VoicePanel } from '../../../features/voice/VoicePanel'
import { AssetListPanel } from '../../../features/asset/AssetListPanel'
import { AiPanel } from '../../../features/ai-panel/AiPanel'

// =================== 三类 id ===================

/** 编辑器大陆:中心 mosaic 树叶子(非岛) */
export type EditorDocId = 'script-editor' | 'flow-view' | 'preview-canvas'

/** 主岛:可 dock/浮出的工具窗 */
export type ToolWindowId = 'project' | 'git' | 'outline' | 'character' | 'ai'

/** 子岛:主岛内 tab(单子岛主岛的子岛 id 与主岛同名,不单独浮出) */
export type SubIslandId = 'scripts' | 'assets' | 'git' | 'outline' | 'profiles' | 'voice' | 'ai'

/** 未实现的占位主岛(ActivityBar 可选,不可浮出) */
export type PlaceholderId = 'search' | 'debug' | 'settings'

/** dock 侧 */
export type DockSide = 'left' | 'right' | 'bottom'

/** 侧槽可见内容(主岛或占位) */
export type SlotContent = ToolWindowId | PlaceholderId

// =================== 编辑器大陆 ===================

export type EditorDocMeta = {
  id: EditorDocId
  title: string
  icon: LucideIcon
  component: ComponentType
}

export const EDITOR_DOCS: readonly EditorDocId[] = ['script-editor', 'flow-view', 'preview-canvas']

export const EDITOR_DOC_META: Record<EditorDocId, EditorDocMeta> = {
  'script-editor': { id: 'script-editor', title: '剧本', icon: FileText, component: ScriptEditor },
  'flow-view': { id: 'flow-view', title: '流程图', icon: GitBranch, component: FlowView },
  'preview-canvas': { id: 'preview-canvas', title: '预览', icon: Box, component: PreviewCanvas }
}

/** mosaic 树合法叶子(= 编辑器大陆三 doc)— 旧名保留,内部即 EDITOR_DOCS */
export const MOSAIC_PANEL_IDS: readonly EditorDocId[] = EDITOR_DOCS

// =================== 主岛 + 子岛 ===================

export type SubIslandDef = {
  id: SubIslandId
  label: string
  icon: LucideIcon
  component: ComponentType
}

export type ToolWindowMeta = {
  id: ToolWindowId
  title: string
  icon: LucideIcon
  defaultDock: DockSide
  /** ≥2:渲染 tab 条,每个子岛可单独脱离;=1:无 tab,整主岛浮出 */
  subIslands: readonly SubIslandDef[]
}

export const TOOL_WINDOWS: readonly ToolWindowMeta[] = [
  {
    id: 'project',
    title: '项目',
    icon: Folder,
    defaultDock: 'left',
    subIslands: [
      { id: 'scripts', label: '脚本', icon: FileText, component: ScriptFileTree },
      { id: 'assets', label: '资产', icon: Image, component: AssetListPanel }
    ]
  },
  {
    id: 'git',
    title: 'Git',
    icon: GitBranch,
    defaultDock: 'left',
    subIslands: [{ id: 'git', label: 'Git', icon: GitBranch, component: GitPanel }]
  },
  {
    id: 'outline',
    title: '大纲',
    icon: ListTree,
    defaultDock: 'left',
    subIslands: [{ id: 'outline', label: '大纲', icon: ListTree, component: OutlinePanel }]
  },
  {
    id: 'character',
    title: '角色',
    icon: Users,
    defaultDock: 'left',
    subIslands: [
      { id: 'profiles', label: '角色档案', icon: Users, component: CharacterListPanel },
      { id: 'voice', label: '语音', icon: Mic, component: VoicePanel }
    ]
  },
  {
    id: 'ai',
    title: 'AI 助手',
    icon: Sparkles,
    defaultDock: 'right',
    subIslands: [{ id: 'ai', label: 'AI', icon: Sparkles, component: AiPanel }]
  }
]

export const TOOL_WINDOW_IDS: readonly ToolWindowId[] = TOOL_WINDOWS.map((t) => t.id)

export const TOOL_WINDOW_META: Record<ToolWindowId, ToolWindowMeta> = Object.fromEntries(
  TOOL_WINDOWS.map((t) => [t.id, t])
) as Record<ToolWindowId, ToolWindowMeta>

/** 所有子岛(含单子岛)— 供浮出渲染与 tab 查询 */
export const SUB_ISLANDS: Record<SubIslandId, SubIslandDef> = Object.fromEntries(
  TOOL_WINDOWS.flatMap((t) => t.subIslands.map((s) => [s.id, s]))
) as Record<SubIslandId, SubIslandDef>

/** 多子岛主岛(有 tab 条,子岛可单独脱离) */
export const isMultiSubIsland = (tw: ToolWindowId): boolean =>
  TOOL_WINDOW_META[tw].subIslands.length > 1

/** 子岛 → 所属主岛 */
export const parentOfSubIsland = (sub: SubIslandId): ToolWindowId | null => {
  for (const t of TOOL_WINDOWS) {
    if (t.subIslands.some((s) => s.id === sub)) return t.id
  }
  return null
}

/** 主岛的默认子岛(第一个) */
export const defaultSubIslandOf = (tw: ToolWindowId): SubIslandId =>
  TOOL_WINDOW_META[tw].subIslands[0].id

// =================== 类型守卫 ===================

const EDITOR_DOC_SET = new Set<EditorDocId>(EDITOR_DOCS)
const TOOL_WINDOW_SET = new Set<ToolWindowId>(TOOL_WINDOW_IDS)

export const isEditorDoc = (id: string): id is EditorDocId =>
  EDITOR_DOC_SET.has(id as EditorDocId)

export const isToolWindowId = (id: string): id is ToolWindowId =>
  TOOL_WINDOW_SET.has(id as ToolWindowId)

export const isSubIslandId = (id: string): id is SubIslandId => id in SUB_ISLANDS

export const isPlaceholderId = (id: string): id is PlaceholderId =>
  id === 'search' || id === 'debug' || id === 'settings'

/** 该子岛 id 是否可单独脱离(仅多子岛主岛的子岛) */
export const isFloatableSubIsland = (id: string): boolean => {
  if (!isSubIslandId(id)) return false
  const parent = parentOfSubIsland(id)
  return parent !== null && isMultiSubIsland(parent)
}

// =================== 浮出内容分发 ===================

/** 可浮出的 id 全集(主岛 + 多子岛子岛 + 编辑器大陆) */
export const FLOATABLE_IDS: readonly string[] = [
  ...EDITOR_DOCS,
  ...TOOL_WINDOW_IDS,
  ...TOOL_WINDOWS.filter((t) => t.subIslands.length > 1).flatMap((t) =>
    t.subIslands.map((s) => s.id)
  )
]

export type FloatingContent =
  | { kind: 'doc'; id: EditorDocId; title: string; component: ComponentType }
  | { kind: 'toolwindow'; id: ToolWindowId }
  | { kind: 'sub'; id: SubIslandId; title: string; component: ComponentType }

/** 按 id 类型分发浮出渲染内容(主岛优先于子岛,避免 'git' 歧义) */
export const getFloatingContent = (id: string): FloatingContent | null => {
  if (isToolWindowId(id)) return { kind: 'toolwindow', id }
  if (isEditorDoc(id)) {
    const m = EDITOR_DOC_META[id]
    return { kind: 'doc', id, title: m.title, component: m.component }
  }
  if (isSubIslandId(id)) {
    const s = SUB_ISLANDS[id]
    return { kind: 'sub', id, title: s.label, component: s.component }
  }
  return null
}

/** 主岛壳组件由 FloatingPanelHost 直接 import SideToolWindow 渲染(此处不导入,避免循环依赖) */
