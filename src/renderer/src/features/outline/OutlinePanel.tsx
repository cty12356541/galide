/**
 * OutlinePanel — 大纲视图(SideToolWindow 内容区)
 *
 * 场景列表与 marker 锚点从 merged/script AST 派生;角色从 manifest 派生。
 * marker 行支持点击 gutter 或右键切换 VM 调试断点(红点标识,持久化至 localStorage)。
 */
import { useMemo } from 'react'
import { useUiStore } from '../../lib/store'
import { ListTree, User, MapPin, Flag } from 'lucide-react'
import { PanelHeader } from '../../components/ui/panel-header'
import { EmptyState } from '../../components/ui/empty-state'
import { extractOutlineScenes } from './outline-scenes'
import { useDebugStore } from '../preview/debug-store'
import { cn } from '../../lib/utils'

export const OutlinePanel = (): JSX.Element => {
  const projectName = useUiStore((s) => s.projectName)
  const manifest = useUiStore((s) => s.manifest)
  const scriptAst = useUiStore((s) => s.scriptAst)
  const projectMergedAst = useUiStore((s) => s.projectMergedAst)
  const viewAst = projectMergedAst ?? scriptAst
  const selectedSceneId = useUiStore((s) => s.selectedSceneId)
  const setSelectedSceneId = useUiStore((s) => s.setSelectedSceneId)
  const selectedCharacterId = useUiStore((s) => s.selectedCharacterId)
  const openCharacterFromOutline = useUiStore((s) => s.openCharacterFromOutline)
  const breakpoints = useDebugStore((s) => s.breakpoints)
  const toggleBreakpoint = useDebugStore((s) => s.toggleBreakpoint)

  const scenes = useMemo(() => extractOutlineScenes(viewAst), [viewAst])

  if (!manifest) {
    return (
      <EmptyState
        icon={ListTree}
        title="打开项目以查看大纲"
        description={projectName ?? undefined}
        className="h-full bg-bg p-8"
        data-testid="outline-panel"
      />
    )
  }

  const characters = manifest.characters ?? []

  return (
    <div className="h-full flex flex-col bg-bg min-h-0" data-testid="outline-panel">
      <section className="flex flex-col min-h-0 flex-1 border-b border-border">
        <PanelHeader title="场景" icon={MapPin} subtitle={scenes.length} size="sm" />
        <div className="flex-1 min-h-0 overflow-auto p-2 space-y-0.5">
          {scenes.length === 0 ? (
            <EmptyState icon={MapPin} title="尚未解析场景" className="py-6 px-3" />
          ) : (
            scenes.map((s) => {
              const active = s.id === selectedSceneId
              return (
                <div key={s.id} className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => setSelectedSceneId(s.id)}
                    data-testid={`outline-scene-${s.id}`}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors',
                      active ? 'bg-accent-soft text-accent' : 'hover:bg-bg-elevated'
                    )}
                  >
                    <span className="text-[10px] font-mono text-text-muted w-6 text-right shrink-0">
                      {s.line}
                    </span>
                    <span className="text-[12px] truncate">{s.id}</span>
                  </button>
                  {s.markers.map((m) => {
                    const hasBp = breakpoints.includes(m.id)
                    return (
                      <div
                        key={`${s.id}:${m.id}:${m.line}`}
                        data-testid={`outline-marker-${m.id}`}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          toggleBreakpoint(m.id)
                        }}
                        className={cn(
                          'group/marker flex items-center gap-1.5 pl-6 pr-2 py-1 rounded-md text-[11px] transition-colors',
                          hasBp
                            ? 'bg-danger-soft text-danger'
                            : 'text-text-muted hover:bg-bg-elevated hover:text-text'
                        )}
                      >
                        <button
                          type="button"
                          aria-label={hasBp ? `移除断点 ${m.id}` : `设置断点 ${m.id}`}
                          aria-pressed={hasBp}
                          data-testid={`outline-bp-${m.id}`}
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
                        <span className="font-mono truncate flex-1">{m.id}</span>
                        <span className="text-[10px] font-mono opacity-60 shrink-0">L{m.line}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      </section>

      <section className="flex flex-col min-h-0 flex-1">
        <PanelHeader title="角色" icon={User} subtitle={characters.length} size="sm" />
        <div className="flex-1 min-h-0 overflow-auto p-2 space-y-0.5">
          {characters.length === 0 ? (
            <EmptyState icon={User} title="尚未创建角色" className="py-6 px-3" />
          ) : (
            characters.map((c) => {
              const active = c.id === selectedCharacterId
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openCharacterFromOutline(c.id)}
                  data-testid={`outline-character-${c.id}`}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors',
                    active ? 'bg-accent-soft text-accent' : 'hover:bg-bg-elevated'
                  )}
                >
                  <User className="w-3 h-3 text-text-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] truncate">{c.name}</div>
                    {c.personality ? (
                      <div className="text-[10px] text-text-muted truncate">{c.personality}</div>
                    ) : null}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}
