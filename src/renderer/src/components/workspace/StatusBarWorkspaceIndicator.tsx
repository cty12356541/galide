/**
 * StatusBarWorkspaceIndicator — 状态栏右侧小指示器
 *
 * 规约 Rule 5: StatusBar 实时反映 workspace layout 状态(preset name + active count +
 * save status)。
 *
 * 行为:
 *  - 显示当前 preset name(writing/flow/review)
 *  - 显示当前 active panels 数量("N panels")
 *  - 显示右侧 dock 状态("AI on" / "—")
 *  - tooltip 显示完整 preset 描述
 *
 * 设计决策:
 *  - 紧凑布局:三项一行,小字号,适合 status bar 高度(28px)
 *  - 不点击触发任何动作(状态展示而非控制;控制走 TitleBar 的 WorkspacePresetSelector)
 */

import { Layout, Cpu } from 'lucide-react'
import { useUiStore } from '../../lib/store'

const PRESET_LABEL: Record<'writing' | 'flow' | 'review', string> = {
  writing: '写作',
  flow: '流程',
  review: '评审'
}

const PRESET_DESC: Record<'writing' | 'flow' | 'review', string> = {
  writing: '左侧 scripts + characters,中央 editor + outline,右 dock 收起',
  flow: '左侧 scripts + outline,中央 flow + editor,右 dock 打开 AI',
  review: '左侧 git + outline,中央 preview + diagnostics,右 dock 打开 AI'
}

export const StatusBarWorkspaceIndicator = (): JSX.Element => {
  const activeActivity = useUiStore((s) => s.workspaceLayout.activeActivity)
  const rightDock = useUiStore((s) => s.workspaceLayout.rightDock)
  const preset = useUiStore((s) => s.workspaceLayout.preset)

  return (
    <span
      className="flex items-center gap-2 text-text-muted"
      title={`工作区预设: ${PRESET_LABEL[preset]} — ${PRESET_DESC[preset]}`}
      data-testid="statusbar-workspace-indicator"
    >
      <span className="flex items-center gap-1">
        <Layout className="w-3 h-3" />
        {PRESET_LABEL[preset]}
      </span>
      <span aria-hidden="true">·</span>
      <span>{activeActivity.length} panels</span>
      <span aria-hidden="true">·</span>
      <span className="flex items-center gap-1">
        <Cpu className="w-3 h-3" />
        {rightDock === 'ai' ? 'AI on' : '—'}
      </span>
    </span>
  )
}