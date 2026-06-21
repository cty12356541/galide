/**
 * SceneRail — 场景索引轨(编辑核心区左栏)
 *
 * 列出 .gal AST 的所有场景(SceneNode),作为 SceneRail↔BeatCardEditor↔FlowView
 * 三视图协同的枢纽:点击场景 → setSelectedSceneId → 对白卡跳该场景 + 决策树高亮。
 * 每个场景显示对白/决策计数摘要(派生自 AST,不写盘)。
 */
import { useMemo } from 'react'
import { MapPin, MessageSquare, GitBranch } from 'lucide-react'
import { PanelHeader } from '../ui/panel-header'
import { useUiStore } from '../../lib/store'
import { collectNodes } from '../../../../shared/dsl/visitor'
import type { SceneNode } from '../../../../shared/dsl/types'
import { cn } from '../../lib/utils'

export const SceneRail = (): JSX.Element => {
  const scriptAst = useUiStore((s) => s.scriptAst)
  const selectedSceneId = useUiStore((s) => s.selectedSceneId)
  const setSelectedSceneId = useUiStore((s) => s.setSelectedSceneId)

  const scenes = useMemo(
    () => (scriptAst ? collectNodes(scriptAst, (n): n is SceneNode => n.type === 'scene') : []),
    [scriptAst]
  )

  return (
    <aside
      className="group island h-full flex flex-col bg-surface overflow-hidden rounded-xl"
      data-testid="scene-rail"
    >
      <PanelHeader title="场景" subtitle={scenes.length} icon={MapPin} size="sm" />
      <div className="flex-1 min-h-0 overflow-y-auto py-1.5">
        {scenes.length === 0 ? (
          <p className="px-3 py-4 text-[12px] text-text-muted">暂无场景</p>
        ) : (
          scenes.map((scene) => {
            const active = scene.id === selectedSceneId
            const dialogueCount = collectNodes(scene, (n) => n.type === 'dialogue').length
            const choiceCount = collectNodes(scene, (n) => n.type === 'choice').length
            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => setSelectedSceneId(scene.id)}
                data-testid={`scene-rail-${scene.id}`}
                className={cn(
                  'w-full text-left px-3 py-2 flex flex-col gap-1 transition-colors border-l-2',
                  active
                    ? 'bg-accent-soft border-accent'
                    : 'border-transparent hover:bg-bg-elevated'
                )}
              >
                <span className={cn('text-[13px] truncate', active ? 'text-accent font-medium' : 'text-text')}>
                  {scene.id}
                </span>
                <span className="flex items-center gap-2.5 text-[10px] text-text-muted">
                  <span className="flex items-center gap-0.5">
                    <MessageSquare className="w-2.5 h-2.5" />
                    {dialogueCount}
                  </span>
                  {choiceCount > 0 ? (
                    <span className="flex items-center gap-0.5">
                      <GitBranch className="w-2.5 h-2.5" />
                      {choiceCount}
                    </span>
                  ) : null}
                </span>
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}
