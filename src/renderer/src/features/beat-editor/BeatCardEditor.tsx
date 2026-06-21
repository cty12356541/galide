/**
 * BeatCardEditor — 对话文本结构化卡片编辑器(方案 B 核心)
 *
 * 以 store.scriptAst 为单一真相源:把选中场景的子节点渲染成可编辑卡片,
 * 编辑即克隆 AST → 局部改 → serialize 写回 store(scriptAst + scriptSource)+
 * 防抖存盘。SceneRail / FlowView 订阅同一 AST,实现三视图协同。
 *
 * 卡片类型(与 DSL 对齐):
 *   - 对白卡 DialogueCard:角色 / 立绘 / 位置 / 文本
 *   - 决策卡 DecisionCard :连续 ChoiceNode 合并为一组选项(每项 text+target)
 *   - 跳转卡 GotoCard      :[跳转:target]
 *   - 标记卡 MarkerCard    :=== id ===
 *   - 设变量 / 条件块(含嵌套分支内 beat 编辑)
 *
 * 已知边界:chapter / 注释 不入 AST(parser 丢弃),卡片编辑不承载。
 */
import { useCallback, useEffect, useMemo } from 'react'
import {
  MessageSquare,
  GitBranch,
  CornerDownRight,
  AppWindow,
  AlertCircle,
  Variable,
  GitMerge,
  Anchor
} from 'lucide-react'
import { PanelHeader } from '../../components/ui/panel-header'
import { Button } from '../../components/ui/button'
import { useUiStore } from '../../lib/store'
import { useScriptSave } from '../../lib/hooks/use-script-save'
import { usePanelFloat } from '../../lib/hooks/use-panel-float'
import { collectNodes } from '../../../../shared/dsl/visitor'
import type { SceneNode, ScriptNode } from '../../../../shared/dsl/types'
import { cn } from '../../lib/utils'
import { groupBeats, type Beat } from './group-beats'
import { BeatList } from './BeatList'
import { mutateBeatChildren } from './beat-locator'

export const BeatCardEditor = ({ embedded = false }: { embedded?: boolean }): JSX.Element => {
  const scriptAst = useUiStore((s) => s.scriptAst)
  const scriptDiagnostics = useUiStore((s) => s.scriptDiagnostics)
  const scriptDirty = useUiStore((s) => s.scriptDirty)
  const selectedSceneId = useUiStore((s) => s.selectedSceneId)
  const editScriptAst = useUiStore((s) => s.editScriptAst)
  const setSelectedSceneId = useUiStore((s) => s.setSelectedSceneId)
  const { saving, scheduleSave } = useScriptSave()
  const float = usePanelFloat()

  const scenes = useMemo(
    () => (scriptAst ? collectNodes(scriptAst, (n): n is SceneNode => n.type === 'scene') : []),
    [scriptAst]
  )
  const scene = useMemo<SceneNode | null>(() => {
    if (scenes.length === 0) return null
    return scenes.find((s) => s.id === selectedSceneId) ?? scenes[0] ?? null
  }, [scenes, selectedSceneId])

  useEffect(() => {
    if (scenes.length > 0 && !selectedSceneId) setSelectedSceneId(scenes[0].id)
  }, [scenes, selectedSceneId, setSelectedSceneId])

  const beats = useMemo(() => (scene ? groupBeats(scene.children) : []), [scene])

  const commit = useCallback(
    (mutator: (ast: ScriptNode) => void): void => {
      editScriptAst(mutator)
      scheduleSave()
    },
    [editScriptAst, scheduleSave]
  )

  const addBeat = (kind: Beat['kind']): void => {
    if (!scene) return
    commit((ast) => {
      mutateBeatChildren(ast, scene.id, [], (children) => {
        let node: SceneNode['children'][number]
        if (kind === 'dialogue') {
          node = { type: 'dialogue', character: '角色', lines: [''], line: 0, column: 1 }
        } else if (kind === 'decision') {
          node = { type: 'choice', line: 0, column: 1, options: [{ text: '新选项', target: '' }] }
        } else if (kind === 'set') {
          node = {
            type: 'set',
            name: 'affinity',
            op: 'set',
            value: { kind: 'literal', value: 0 },
            line: 0,
            column: 1
          }
        } else if (kind === 'conditional') {
          node = {
            type: 'if',
            line: 0,
            column: 1,
            branches: [
              { kind: 'if', condition: { kind: 'literal', value: true }, children: [] },
              { kind: 'else', children: [] }
            ]
          }
        } else if (kind === 'goto') {
          node = { type: 'goto', target: '', line: 0, column: 1 }
        } else {
          node = { type: 'marker', id: '新标记', line: 0, column: 1 }
        }
        children.push(node)
      })
    })
  }

  const sceneMeta = scene
    ? [
        scene.background ? `背景 ${scene.background}` : null,
        scene.bgm ? `BGM ${scene.bgm}` : null
      ].filter(Boolean)
    : []

  const parseErrors = useMemo(
    () => scriptDiagnostics.filter((d) => d.severity === 'error'),
    [scriptDiagnostics]
  )

  return (
    <section
      className={cn(
        'group island h-full flex flex-col bg-surface overflow-hidden',
        embedded ? '' : 'rounded-xl'
      )}
      data-testid="beat-card-editor"
    >
      {embedded ? (
        <div className="h-8 flex items-center gap-2 px-3 border-b border-border bg-bg-elevated flex-shrink-0">
          <MessageSquare className="w-3.5 h-3.5 text-accent flex-shrink-0" />
          <span className="text-sm text-text truncate">
            {scene ? `场景 · ${scene.id}` : '对话文本'}
          </span>
          {saving ? (
            <span className="text-[10px] text-text-muted ml-auto flex-shrink-0">保存中…</span>
          ) : null}
        </div>
      ) : (
        <PanelHeader
          title={scene ? `场景 · ${scene.id}` : '对话文本'}
          subtitle={scene ? `${beats.length} beat` : undefined}
          icon={MessageSquare}
          actions={
            <>
              <span className="text-[10px] text-text-muted">
                {saving ? '保存中…' : scriptDirty ? '未保存' : '已同步'}
              </span>
              {scriptDirty && !saving ? (
                <span className="w-1.5 h-1.5 rounded-full bg-warning" title="未保存" />
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => float('script-editor')}
                title="原始文本编辑"
                aria-label="原始文本编辑"
                data-testid="beat-float"
              >
                <AppWindow className="w-3.5 h-3.5" />
              </Button>
            </>
          }
        />
      )}
      {sceneMeta.length > 0 ? (
        <div className="px-3 py-1.5 text-[11px] text-text-muted bg-bg-elevated border-b border-border flex gap-3">
          {sceneMeta.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      ) : null}

      {scene ? (
        <div className="px-3 py-2 grid grid-cols-2 gap-2 bg-bg-elevated/50 border-b border-border">
          <label className="flex items-center gap-1.5 text-[11px] text-text-muted">
            背景
            <input
              className="w-full bg-transparent border border-border rounded-lg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
              value={scene.background ?? ''}
              placeholder="assets/…"
              onChange={(e) =>
                commit((ast) => {
                  const t = collectNodes(ast, (n): n is SceneNode => n.type === 'scene').find(
                    (s) => s.id === scene.id
                  )
                  if (t) t.background = e.target.value || undefined
                })
              }
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-text-muted">
            BGM
            <input
              className="w-full bg-transparent border border-border rounded-lg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
              value={scene.bgm ?? ''}
              placeholder="assets/…"
              onChange={(e) =>
                commit((ast) => {
                  const t = collectNodes(ast, (n): n is SceneNode => n.type === 'scene').find(
                    (s) => s.id === scene.id
                  )
                  if (t) t.bgm = e.target.value || undefined
                })
              }
            />
          </label>
        </div>
      ) : null}

      {parseErrors.length > 0 ? (
        <div
          className="px-3 py-2 bg-danger-soft border-b border-border space-y-1"
          data-testid="beat-diagnostics"
        >
          {parseErrors.map((d, i) => (
            <div key={i} className="text-[11px] text-danger-strong flex items-start gap-1.5">
              <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span className="font-mono opacity-70">L{d.line}</span>
              <span>{d.message}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {scene && beats.length > 0 ? (
          <BeatList
            children={scene.children}
            sceneId={scene.id}
            locator={[]}
            depth={0}
            commit={commit}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-text-muted text-sm gap-3">
            <p>该场景还没有内容</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 px-3 py-2 border-t border-border bg-bg-elevated">
        <span className="text-[11px] text-text-muted mr-1">添加</span>
        <ToolbarBtn label="对白" icon={MessageSquare} onClick={() => addBeat('dialogue')} />
        <ToolbarBtn label="决策" icon={GitBranch} onClick={() => addBeat('decision')} />
        <ToolbarBtn label="设变量" icon={Variable} onClick={() => addBeat('set')} />
        <ToolbarBtn label="条件" icon={GitMerge} onClick={() => addBeat('conditional')} />
        <ToolbarBtn label="跳转" icon={CornerDownRight} onClick={() => addBeat('goto')} />
        <ToolbarBtn label="标记" icon={Anchor} onClick={() => addBeat('marker')} />
      </div>
    </section>
  )
}

const ToolbarBtn = ({
  label,
  icon: Icon,
  onClick
}: {
  label: string
  icon: typeof MessageSquare
  onClick: () => void
}): JSX.Element => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-1 h-7 px-2 rounded-md text-[12px] text-text-muted hover:text-text hover:bg-surface transition-colors"
  >
    <Icon className="w-3 h-3" />
    {label}
  </button>
)
