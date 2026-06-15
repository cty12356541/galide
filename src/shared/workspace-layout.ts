/**
 * WorkspaceLayout — 6 区域布局的中央真相(单一数据源)
 *
 * 规约依据: .style-spec/layers/renderer/conventions.yaml#workspace_layout
 *   6 区域: title_bar / activity_bar / side_panel / center_tabs / right_dock / status_bar
 *   3 preset: writing | flow | review(presets.yaml)
 *
 * 设计要点:
 *  - activeActivity 是数组(multi-split)— ActivityBar 6 项可同时激活,SidePanel
 *    按顺序渲染对应 panel。
 *  - rightDock 是单值或 null — 规约规定 right dock 只有一个 panel,目前只支持
 *    'ai' 面板;null 表示收起。
 *  - schemaVersion 用于未来的 layout 字段升级(老版本数据迁移占位)。
 *  - 默认值走 DEFAULT_WORKSPACE_LAYOUT 常量,mergeWorkspaceLayout 用于读取
 *    持久化数据时的容错合并(Rule 6)。
 *
 * 本文件作为 single source of truth:
 *  - main 端 workspace-handlers 读 / 写盘用
 *  - preload 端 window.galide.workspace.* 返回类型用
 *  - renderer 端 store.ts + DockviewCenterTabs 类型用(由 renderer-side
 *    src/renderer/src/lib/workspace-layout.ts re-export)
 */

export type ActivityBarItemId = 'scripts' | 'characters' | 'voice' | 'assets' | 'outline' | 'git'

export type CenterTabId = 'editor' | 'outline' | 'diagnostics' | 'flow' | 'preview'

export type RightDockId = 'ai' | null

export type WorkspacePresetId = 'writing' | 'flow' | 'review'

export const ACTIVITY_BAR_ITEMS: readonly ActivityBarItemId[] = [
  'scripts',
  'characters',
  'voice',
  'assets',
  'outline',
  'git'
] as const

export const CENTER_TAB_IDS: readonly CenterTabId[] = [
  'editor',
  'outline',
  'diagnostics',
  'flow',
  'preview'
] as const

export const WORKSPACE_PRESETS: readonly WorkspacePresetId[] = ['writing', 'flow', 'review'] as const

export const WORKSPACE_LAYOUT_SCHEMA_VERSION = 1

export type WorkspaceLayout = {
  /** 当前激活的 Activity Bar 项(可多个,multi-split) */
  activeActivity: ActivityBarItemId[]
  /** 中央 dockview tab 列表 */
  openCenterTabs: CenterTabId[]
  /** 右侧 dock 内容(null = 收起) */
  rightDock: RightDockId
  /** 当前 workspace preset(用于 StatusBar 指示器显示) */
  preset: WorkspacePresetId
  /** 持久化 schema 版本,用于未来升级兼容 */
  schemaVersion: number
}

/**
 * 默认布局 — 写作场景:左侧 scripts + characters 双 split,中央 editor + outline 双 tab,
 * 右侧 dock 收起,preset = writing。
 */
export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = {
  activeActivity: ['scripts', 'characters'],
  openCenterTabs: ['editor', 'outline'],
  rightDock: null,
  preset: 'writing',
  schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION
}

/**
 * 应用一个 workspace preset — 原子事务:一次返回新的 layout,所有相关字段(activeActivity
 * / openCenterTabs / rightDock)同时变更(Rule 4)。
 *
 * 三个 preset 的语义:
 *  - writing: 剧本写作,左侧 scripts + characters,中央 editor + outline,右 dock 收起。
 *  - flow: 流程设计,左侧 scripts + outline,中央 flow + editor,右 dock 打开 AI。
 *  - review: 评审,左侧 git + outline,中央 preview + diagnostics + editor,右 dock 打开 AI。
 */
export const applyWorkspacePreset = (
  layout: WorkspaceLayout,
  presetId: WorkspacePresetId
): WorkspaceLayout => {
  switch (presetId) {
    case 'writing':
      return {
        ...layout,
        activeActivity: ['scripts', 'characters'],
        openCenterTabs: ['editor', 'outline'],
        rightDock: null,
        preset: 'writing'
      }
    case 'flow':
      return {
        ...layout,
        activeActivity: ['scripts', 'outline'],
        openCenterTabs: ['flow', 'editor'],
        rightDock: 'ai',
        preset: 'flow'
      }
    case 'review':
      return {
        ...layout,
        activeActivity: ['git', 'outline'],
        openCenterTabs: ['preview', 'diagnostics', 'editor'],
        rightDock: 'ai',
        preset: 'review'
      }
    default: {
      // 防御性:WorkspacePresetId 是 union,但运行时若传入未知值,降级到默认
      const exhaustive: never = presetId
      void exhaustive
      return { ...DEFAULT_WORKSPACE_LAYOUT }
    }
  }
}

/**
 * 容错合并:stored 是从磁盘读到的 Partial / null / undefined,fallback 是当前默认值。
 * 行为:
 *  - 若 stored 为 null/undefined:返回 fallback 的副本(避免共享引用)。
 *  - 字段缺失 / 类型不对:用 fallback 的对应字段。
 *  - activeActivity 过滤掉未知 id。
 *  - openCenterTabs 过滤掉未知 id,但保序。
 *  - schemaVersion 不匹配时仍返回合并结果(升级留 V2)。
 */
export const mergeWorkspaceLayout = (
  stored: Partial<WorkspaceLayout> | null | undefined,
  fallback: WorkspaceLayout
): WorkspaceLayout => {
  if (!stored || typeof stored !== 'object') {
    return { ...fallback }
  }

  const validActivity = new Set<string>(ACTIVITY_BAR_ITEMS)
  const validTabs = new Set<string>(CENTER_TAB_IDS)
  const validPreset = new Set<string>(WORKSPACE_PRESETS)

  const activeActivity = Array.isArray(stored.activeActivity)
    ? stored.activeActivity.filter((x): x is ActivityBarItemId =>
        typeof x === 'string' && validActivity.has(x)
      )
    : fallback.activeActivity

  const openCenterTabs = Array.isArray(stored.openCenterTabs)
    ? stored.openCenterTabs.filter((x): x is CenterTabId =>
        typeof x === 'string' && validTabs.has(x)
      )
    : fallback.openCenterTabs

  const rightDock =
    stored.rightDock === 'ai' || stored.rightDock === null
      ? stored.rightDock
      : fallback.rightDock

  const preset =
    typeof stored.preset === 'string' && validPreset.has(stored.preset)
      ? (stored.preset as WorkspacePresetId)
      : fallback.preset

  const schemaVersion =
    typeof stored.schemaVersion === 'number' && stored.schemaVersion > 0
      ? stored.schemaVersion
      : fallback.schemaVersion

  return {
    activeActivity,
    openCenterTabs,
    rightDock,
    preset,
    schemaVersion
  }
}