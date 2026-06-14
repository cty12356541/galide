/**
 * DockviewCenterTabs — 中央 Tab Group(规约 Rule 2: 中央面板必须走 dockview)
 *
 * 规约依据: .style-spec/layers/renderer/conventions.yaml#workspace_layout.center_tabs
 *           .style-spec/layers/renderer/conventions.yaml#workspace_layout.tab_group
 *           - closable: true
 *           - reorderable: true
 *           - drag_to_dock: true
 *           - engine: "dockview"
 *
 * 行为:
 *  - 从 useUiStore.workspaceLayout.openCenterTabs 读出应打开的 tab 列表
 *  - workspace preset 切换 / 手关闭 tab → workspaceLayout 同步更新
 *  - 每次 workspaceLayout 变化 → 与 dockview 同步(reconcile)
 *
 * 实现:
 *  - DockviewReact 受控,通过 api.addPanel / panels.forEach(remove) 调和
 *  - 不用 api.fromJSON — 它假设序列化 layout,本轮先实现"重建式同步"
 *    (workspaceLayout 列表变化 → 清空 dockview → 重新 addPanel)
 *  - 调和后通过 api 内部 panel 列表保证 dockview 内部状态确定
 */

import React, { useEffect, useRef, useCallback } from 'react'
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanel,
  type IDockviewPanelProps
} from 'dockview'
import { useUiStore } from '../../lib/store'
import { ScriptEditor } from '../../features/script-editor/ScriptEditor'
import { FlowView } from '../../features/flow-view/FlowView'
import { PreviewCanvas } from '../../features/preview/PreviewCanvas'
import { DiagnosticsPanel } from '../../features/script-editor/DiagnosticsPanel'
import { OutlinePanel } from '../../features/outline/OutlinePanel'
import type { CenterTabId } from '../../lib/workspace-layout'

// 真实 panel 组件表(对应规约 .style-spec/layers/renderer/conventions.yaml#workspace_layout.center_tabs)
// dockview 要求 components 是 Record<string, FunctionComponent<IDockviewPanelProps>>
// 用 React.memo 包一层确保 dockview 内部 `$$typeof` 检查通过
// (dockview 拒收 class component 或没 memo 化的组件)
const TAB_COMPONENTS: Record<string, React.FunctionComponent<IDockviewPanelProps>> = {
  editor: React.memo(ScriptEditor as React.ComponentType) as unknown as React.FunctionComponent<IDockviewPanelProps>,
  // P3 修复(2026-06-13): outline 真接入 OutlinePanel(之前是占位文本)
  outline: React.memo(OutlinePanel as React.ComponentType) as unknown as React.FunctionComponent<IDockviewPanelProps>,
  // DiagnosticsPanel 接受 items prop,本轮 dockview 集成不接 ScriptEditor 的
  // diagnostics 状态(后续 PR 把 items 提升为全局 store 后再接)
  diagnostics: React.memo(DiagnosticsPanel as React.ComponentType) as unknown as React.FunctionComponent<IDockviewPanelProps>,
  flow: React.memo(FlowView as React.ComponentType) as unknown as React.FunctionComponent<IDockviewPanelProps>,
  preview: React.memo(PreviewCanvas as React.ComponentType) as unknown as React.FunctionComponent<IDockviewPanelProps>
}

const TAB_LABELS: Record<CenterTabId, string> = {
  editor: '脚本',
  outline: '大纲',
  diagnostics: '诊断',
  flow: '流程图',
  preview: '预览'
}

const PARAMETERS_KEY_PREFIX = 'galide-tab-'

const getParametersKey = (id: CenterTabId): string => `${PARAMETERS_KEY_PREFIX}${id}`

export const DockviewCenterTabs = (): React.JSX.Element => {
  const openTabs = useUiStore((s) => s.workspaceLayout.openCenterTabs)
  const apiRef = useRef<DockviewReadyEvent['api'] | null>(null)
  const reconcileRef = useRef<((ids: CenterTabId[]) => void) | null>(null)

  const onReady = useCallback((event: DockviewReadyEvent): void => {
    apiRef.current = event.api

    // 监听 tab 关闭 → 同步到 workspaceLayout
    event.api.onDidRemovePanel((panel: IDockviewPanel): void => {
      const id = panel.params?.id as CenterTabId | undefined
      if (!id) return
      useUiStore.setState((s) => {
        const next = s.workspaceLayout.openCenterTabs.filter((t) => t !== id)
        // 防止全部关闭(规约语义:dockview 必须始终有 ≥1 tab)
        if (next.length === 0) return s
        return { workspaceLayout: { ...s.workspaceLayout, openCenterTabs: next } }
      })
    })
  }, [])

  // 调和:openTabs 与 dockview 内部 panels 同步
  //  - 对每个 ids[i],确保 dockview 有一个对应 panel
  //  - 对每个多余 panel,移除
  useEffect(() => {
    const api = apiRef.current
    if (!api) return

    const sync = (): void => {
      const existing: IDockviewPanel[] = api.panels
      const existingIds = new Set(
        existing
          .map((p) => p.params?.id as CenterTabId | undefined)
          .filter((x): x is CenterTabId => Boolean(x))
      )

      // 1. 移除 dockview 中多余 panel
      for (const p of existing) {
        const id = p.params?.id as CenterTabId | undefined
        if (id && !openTabs.includes(id)) {
          api.removePanel(p)
        }
      }

      // 2. 添加 openTabs 中缺失的 panel
      // 注意: addPanel.component 是 component ID 字符串(对应 <DockviewReact components={...}> 的 key)
      for (const id of openTabs) {
        if (!existingIds.has(id)) {
          api.addPanel({
            id: getParametersKey(id),
            component: id, // 与 TAB_COMPONENTS 字典的 key 对齐
            title: TAB_LABELS[id],
            // P0-10 修复(2026-06-15): dockview 6.x 没有 attributes 字段,
            // 把 data-testid 放进 params 让测试 selector 能找到 panel
            params: { id, 'data-testid': `dockview-panel-${id}` }
          })
        }
      }
    }
    reconcileRef.current = sync
    sync()
  }, [openTabs])

  // 关闭所有 panel 时的兜底 — 显示空态
  if (openTabs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-text-muted bg-bg">
        空白工作区
        <button
          type="button"
          onClick={() => useUiStore.getState().applyWorkspacePreset('writing')}
          className="ml-2 underline text-accent"
        >
          切到写作
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden dockview-theme-galide">
      <DockviewReact
        onReady={onReady}
        components={TAB_COMPONENTS}
        // 启用 Tab 关闭、拖拽等规约行为
        // dockview 默认就是 closable + draggable
      />
    </div>
  )
}

// 注意:AI 面板的 rightDock 同步在 App.tsx 层,这里不重复
// 当用户从 dockview 拖 panel 到右侧(rightDock),会触发 rightDock='ai'
// 但当前 dockview 默认 layout 是单 panel group,无独立 right dock
// — Right Dock 仍由 App.tsx 的 AiPanel 实现
//
// V2 修复(2026-06-13): 规约要求 drag_to_dock:true,但 dockview 多 group 布局尚未实现,
// 故 center tabs 面板的 drag-to-dock 行为暂不可用。flow preset 切换通过
// applyWorkspacePreset('flow') → rightDock='ai' 生效,rightDock 是单一真相来源。
