/**
 * SceneRail — 场景索引轨(编辑核心区左栏)
 *
 * 列出 .gal AST 的所有场景(SceneNode),作为 SceneRail↔BeatCardEditor↔FlowView
 * 三视图协同的枢纽:点击场景 → setSelectedSceneId → 对白卡跳该场景 + 决策树高亮。
 * 同时展示场景内 marker 锚点行,支持点击 gutter 或右键切换 VM 调试断点(红点标识)。
 */
import { useMemo } from 'react'
import { MapPin, MessageSquare, GitBranch, Flag } from 'lucide-react'
import { PanelHeader } from '../ui/panel-header'
import { useUiStore } from '../../lib/store'
import { collectNodes } from '../../../../shared/dsl/visitor'
import type { SceneNode } from '../../../../shared/dsl/types'
import { extractSceneMarkers } from '../../features/outline/outline-scenes'
import { useDebugStore } from '../../features/preview/debug-store'
import { cn } from '../../lib/utils'

export const SceneRail = (): JSX.Element => {
  const scriptAst = useUiStore((s) => s.scriptAst)
  const projectMergedAst = useUiStore((s) => s.projectMergedAst)
  const viewAst = projectMergedAst ?? scriptAst
  const selectedSceneId = useUiStore((s) => s.selectedSceneId)
  const setSelectedSceneId = useUiStore((s) => s.setSelectedSceneId)
  const breakpoints = useDebugStore((s) => s.breakpoints)
  const toggleBreakpoint = useDebugStore((s) => s.toggleBreakpoint)

  const scenes = useMemo(
    () => (viewAst ? collectNodes(viewAst, (n): n is SceneNode => n.type === 'scene') : []),
    [viewAst]
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
            const markers = extractSceneMarkers(scene)
            return (
              <div key={scene.id}>
                <button
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
                  <span
                    className={cn(
                      'text-[13px] truncate',
                      active ? 'text-accent font-medium' : 'text-text'
                    )}
                  >
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
                {markers.length > 0 ? (
                  <div className="pl-4 pr-2 pb-1 space-y-0.5">
                    {markers.map((m) => {
                      const hasBp = breakpoints.includes(m.id)
                      return (
                        <div
                          key={`${scene.id}:${m.id}:${m.line}`}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            toggleBreakpoint(m.id)
                          }}
                          className={cn(
                            'group/marker flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] transition-colors',
                            hasBp
                              ? 'bg-danger-soft text-danger'
                              : 'text-text-muted hover:bg-bg-elevated hover:text-text'
                          )}
                        >
                          <button
                            type="button"
                            aria-label={hasBp ? `移除断点 ${m.id}` : `设置断点 ${m.id}`}
                            aria-pressed={hasBp}
                            data-testid={`scene-rail-bp-${m.id}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleBreakpoint(m.id)
                            }}
                            title={hasBp ? `移除断点: ${m.id}` : `点击设置断点: ${m.id}`}
                            className="w-4 h-4 flex items-center justify-center shrink-0 rounded-full"
                          >
                            <span
                              className={cn(
                                'w-2 h-2 rounded-full transition-all',
                                hasBp
                                  ? 'bg-danger ring-2 ring-danger/30'
                                  : 'border border-text-muted/50 opacity-50 group-hover/marker:opacity-100'
                              )}
                            />
                          </button>
                          <Flag className="w-2.5 h-2.5 shrink-0 opacity-70" />
                          <button
                            type="button"
                            onClick={() => setSelectedSceneId(scene.id)}
                            className="font-mono truncate text-left flex-1"
                            title={`=== ${m.id} === (L${m.line})`}
                          >
                            {m.id}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
