/**
 * BrainPanel — 项目大脑查看面板(只读)
 *
 * 展示 project-brain.json 的三类叙事知识:伏笔账本 / 角色关系 / 路线知识边界。
 * 写入由 agent 工具(brain_upsert_*)完成;本面板提供查看与手动刷新。
 */
import { useCallback, useEffect, useState } from 'react'
import { Brain, RefreshCw, BookmarkCheck, Users, ShieldQuestion } from 'lucide-react'
import { useUiStore } from '../../lib/store'
import { useBrain } from '../../lib/ipc/use-brain'
import { PanelHeader } from '../../components/ui/panel-header'
import { EmptyState } from '../../components/ui/empty-state'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'
import type { ProjectBrain } from '../../../../shared/brain/schema'

const FORESHADOWING_STATUS_LABEL: Record<string, string> = {
  planted: '未回收',
  resolved: '已回收',
  abandoned: '已放弃'
}

export const BrainPanel = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const projectName = useUiStore((s) => s.projectName)
  const brainApi = useBrain()
  const [brain, setBrain] = useState<ProjectBrain | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!projectPath) return
    setLoading(true)
    try {
      const r = await brainApi.list(projectPath)
      setBrain(r?.brain ?? null)
      setInvalid(r?.invalid ?? false)
    } finally {
      setLoading(false)
    }
  }, [projectPath, brainApi])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!projectPath) {
    return (
      <EmptyState
        icon={Brain}
        title="打开项目以查看项目大脑"
        description={projectName ?? undefined}
        className="h-full bg-bg p-8"
        data-testid="brain-panel"
      />
    )
  }

  const foreshadowings = brain?.foreshadowings ?? []
  const relationships = brain?.relationships ?? []
  const knowledge = brain?.knowledgeBoundaries ?? []
  const isEmpty = foreshadowings.length === 0 && relationships.length === 0 && knowledge.length === 0

  return (
    <div className="h-full flex flex-col bg-bg min-h-0" data-testid="brain-panel">
      <PanelHeader
        title="项目大脑"
        icon={Brain}
        subtitle={`${foreshadowings.filter((f) => f.status === 'planted').length}/${foreshadowings.length} 伏笔`}
        size="sm"
        actions={
          <Button variant="ghost" size="icon" onClick={() => void refresh()} disabled={loading} title="刷新">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </Button>
        }
      />
      {invalid ? (
        <div className="mx-2 mt-2 px-2 py-1.5 rounded-md bg-warning-soft text-warning text-xs">
          project-brain.json 无法解析,以下为空状态(文件可能损坏)
        </div>
      ) : null}
      <div className="flex-1 min-h-0 overflow-auto p-2 space-y-4">
        {isEmpty && !loading ? (
          <EmptyState
            icon={Brain}
            title="项目大脑为空"
            description="让 AI 助手登记伏笔、角色关系与路线知识边界后,这里会展示"
            className="py-6 px-3"
          />
        ) : null}

        {foreshadowings.length > 0 ? (
          <section data-testid="brain-foreshadowings">
            <PanelHeader title="伏笔账本" icon={BookmarkCheck} subtitle={foreshadowings.length} size="sm" />
            <div className="space-y-1 px-1">
              {foreshadowings.map((f) => (
                <div key={f.id} className="px-2 py-1.5 rounded-md hover:bg-bg-elevated text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[10px]',
                        f.status === 'planted' && 'bg-warning-soft text-warning',
                        f.status === 'resolved' && 'bg-accent-soft text-accent',
                        f.status === 'abandoned' && 'bg-bg-elevated text-text-muted'
                      )}
                    >
                      {FORESHADOWING_STATUS_LABEL[f.status] ?? f.status}
                    </span>
                    <span className="flex-1 text-text">{f.description}</span>
                  </div>
                  {f.plantedInSceneId ? (
                    <div className="text-text-muted mt-0.5">埋于 {f.plantedInSceneId}{f.plantedInFile ? ` (${f.plantedInFile})` : ''}</div>
                  ) : null}
                  {f.expectedPayoff ? (
                    <div className="text-text-muted mt-0.5">预期回收: {f.expectedPayoff}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {relationships.length > 0 ? (
          <section data-testid="brain-relationships">
            <PanelHeader title="角色关系" icon={Users} subtitle={relationships.length} size="sm" />
            <div className="space-y-1 px-1">
              {relationships.map((r) => (
                <div key={r.id} className="px-2 py-1.5 rounded-md hover:bg-bg-elevated text-xs">
                  <div className="text-text">
                    {r.characterA} × {r.characterB}
                  </div>
                  <div className="text-text-muted mt-0.5">{r.description}</div>
                  {r.stages.length > 0 ? (
                    <div className="text-text-muted mt-0.5">
                      阶段:{r.stages.map((s) => s.note).join(' → ')}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {knowledge.length > 0 ? (
          <section data-testid="brain-knowledge">
            <PanelHeader title="路线知识边界" icon={ShieldQuestion} subtitle={knowledge.length} size="sm" />
            <div className="space-y-1 px-1">
              {knowledge.map((k) => (
                <div key={k.id} className="px-2 py-1.5 rounded-md hover:bg-bg-elevated text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[10px]',
                        k.known ? 'bg-accent-soft text-accent' : 'bg-bg-elevated text-text-muted'
                      )}
                    >
                      {k.known ? '已知' : '未知'}
                    </span>
                    <span className="text-text">{k.fact}</span>
                  </div>
                  <div className="text-text-muted mt-0.5">当 {k.condition}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
