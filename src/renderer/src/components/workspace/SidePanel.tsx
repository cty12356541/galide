/**
 * SidePanel — 左侧活动面板容器(规约 Rule 1: 一个面板 = 一个 feature)
 *
 * 行为:
 *  - 读取 useUiStore.workspaceLayout.activeActivity(数组,multi-split)
 *  - 按数组顺序依次渲染对应 panel(<PanelFor id={id} />)
 *  - 空数组时返回 <div className="w-0" />,让 layout 收起到 0 宽(规约)
 *
 * PanelFor dict:
 *  - scripts → ScriptListPanel(包装 ScriptFileTree)
 *  - characters → CharacterListPanel(features/character)
 *  - voice → VoicePanel(features/voice)
 *  - assets → AssetListPanel(features/asset,本 PR 新建)
 *  - outline → OutlinePanel(中央 tab 同组件复用)
 *  - git → GitPanel(features/git,本 PR 新建)
 *
 * 设计决策(2026-06-15): 见 deliverable.md 决策日志
 *  - 为什么 SidePanel 内含 outline panel + center tab 里也有 OutlinePanel:
 *    二者复用同一个 OutlinePanel 组件,数据源一致(manifest)。SidePanel 里的 outline
 *    显示紧凑列表,center tab 里的 outline 显示完整 panel chrome。
 */

import { useUiStore } from '../../lib/store'
import type { ActivityBarItemId } from '../../lib/workspace-layout'
import { ScriptListPanel } from '../../features/script-editor/ScriptListPanel'
import { CharacterListPanel } from '../../features/character/CharacterListPanel'
import { VoicePanel } from '../../features/voice/VoicePanel'
import { AssetListPanel } from '../../features/asset/AssetListPanel'
import { GitPanel } from '../../features/git/GitPanel'
import { OutlinePanel } from '../../features/outline/OutlinePanel'

type PanelComponent = () => JSX.Element

const PANEL_FOR: Record<ActivityBarItemId, PanelComponent> = {
  scripts: ScriptListPanel,
  characters: CharacterListPanel,
  voice: VoicePanel,
  assets: AssetListPanel,
  outline: OutlinePanel,
  git: GitPanel
}

export const SidePanel = (): JSX.Element => {
  const activeActivity = useUiStore((s) => s.workspaceLayout.activeActivity)

  if (activeActivity.length === 0) {
    return <div className="w-0" data-testid="side-panel-empty" />
  }

  return (
    <aside
      className="w-72 bg-surface flex-shrink-0 flex overflow-hidden"
      data-testid="side-panel"
    >
      {activeActivity.map((id) => {
        const Panel = PANEL_FOR[id]
        return (
          <div
            key={id}
            className="flex-1 min-w-0 border-r border-border last:border-r-0"
            data-testid={`side-panel-${id}`}
          >
            <Panel />
          </div>
        )
      })}
    </aside>
  )
}