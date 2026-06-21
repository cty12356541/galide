/**
 * OutlinePanel — 大纲视图(中央 tab + SidePanel 共用)
 *
 * 场景列表从 scriptAst 派生(与 SceneRail 同源);角色列表从 manifest 派生。
 */
import { useMemo } from 'react'
import { useUiStore } from '../../lib/store'
import { ListTree, User, MapPin } from 'lucide-react'
import { PanelHeader } from '../../components/ui/panel-header'
import { EmptyState } from '../../components/ui/empty-state'
import { extractOutlineScenes } from './outline-scenes'
import { cn } from '../../lib/utils'

export const OutlinePanel = (): JSX.Element => {
  const projectName = useUiStore((s) => s.projectName)
  const manifest = useUiStore((s) => s.manifest)
  const scriptAst = useUiStore((s) => s.scriptAst)
  const selectedSceneId = useUiStore((s) => s.selectedSceneId)
  const setSelectedSceneId = useUiStore((s) => s.setSelectedSceneId)

  const scenes = useMemo(() => extractOutlineScenes(scriptAst), [scriptAst])

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
    <div className="h-full flex flex-col bg-bg" data-testid="outline-panel">
      <PanelHeader title="大纲" icon={ListTree} subtitle={projectName ?? ''} size="md" />

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-0 overflow-hidden">
        <section className="flex flex-col overflow-hidden border-r border-border">
          <PanelHeader title="场景" icon={MapPin} subtitle={scenes.length} size="sm" />
          <div className="flex-1 overflow-auto p-2 space-y-0.5">
            {scenes.length === 0 ? (
              <EmptyState icon={MapPin} title="尚未解析场景" className="py-6 px-3" />
            ) : (
              scenes.map((s) => {
                const active = s.id === selectedSceneId
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSceneId(s.id)}
                    data-testid={`outline-scene-${s.id}`}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors',
                      active ? 'bg-accent-soft text-accent' : 'hover:bg-bg-elevated'
                    )}
                  >
                    <span className="text-[10px] font-mono text-text-muted w-6 text-right">
                      {s.line}
                    </span>
                    <span className="text-[12px] truncate">{s.id}</span>
                  </button>
                )
              })
            )}
          </div>
        </section>

        <section className="flex flex-col overflow-hidden">
          <PanelHeader title="角色" icon={User} subtitle={characters.length} size="sm" />
          <div className="flex-1 overflow-auto p-2 space-y-0.5">
            {characters.length === 0 ? (
              <EmptyState icon={User} title="尚未创建角色" className="py-6 px-3" />
            ) : (
              characters.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-elevated"
                >
                  <User className="w-3 h-3 text-text-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] truncate">{c.name}</div>
                    {c.personality && (
                      <div className="text-[10px] text-text-muted truncate">{c.personality}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
