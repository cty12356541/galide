/**
 * Renderer 端的 workspace-layout re-export。
 *
 * 为什么需要这一层:
 *  - shared/workspace-layout.ts 是单一数据源(main / preload / shared/types 共用)。
 *  - renderer-side import 路径(./workspace-layout)在 store.ts / DockviewCenterTabs.tsx
 *    已 hardcode,直接 re-export shared 那份,避免双源真相。
 *  - vite bundler 不需要 alias 路径,直接通过相对路径 import 即可。
 *
 * 任何类型/常量/函数新增,必须先在 shared 那份定义,再由本文件 re-export。
 */

export {
  ACTIVITY_BAR_ITEMS,
  CENTER_TAB_IDS,
  DEFAULT_WORKSPACE_LAYOUT,
  WORKSPACE_LAYOUT_SCHEMA_VERSION,
  WORKSPACE_PRESETS,
  applyWorkspacePreset,
  mergeWorkspaceLayout
} from '../../../shared/workspace-layout'

export type {
  ActivityBarItemId,
  CenterTabId,
  RightDockId,
  WorkspaceLayout,
  WorkspacePresetId
} from '../../../shared/workspace-layout'