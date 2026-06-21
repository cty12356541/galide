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
 *
 * 已知边界:chapter / 注释 不入 AST(parser 丢弃),卡片编辑不承载。
 */
import { useCallback, useEffect, useMemo } from 'react'
import {
  MessageSquare,
  GitBranch,
  Anchor,
  CornerDownRight,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  AppWindow,
  AlertCircle
} from 'lucide-react'
import { PanelHeader } from '../../components/ui/panel-header'
import { Button } from '../../components/ui/button'
import { useUiStore } from '../../lib/store'
import { useScriptSave } from '../../lib/hooks/use-script-save'
import { usePanelFloat } from '../../lib/hooks/use-panel-float'
import { collectNodes } from '../../../../shared/dsl/visitor'
import type {
  AstNode,
  ChoiceNode,
  DialogueNode,
  GotoNode,
  MarkerNode,
  SceneNode,
  ScriptNode
} from '../../../../shared/dsl/types'
import { cn } from '../../lib/utils'

type Position = 'left' | 'right' | 'center'

/** 连续 ChoiceNode 合并为一组(对应一段决策) */
type Beat =
  | { kind: 'dialogue'; node: DialogueNode; index: number }
  | { kind: 'decision'; nodes: ChoiceNode[]; startIndex: number }
  | { kind: 'goto'; node: GotoNode; index: number }
  | { kind: 'marker'; node: MarkerNode; index: number }

/** 把场景 children 按连续 ChoiceNode 分组为 beat 列表(保留原索引) */
const groupBeats = (children: AstNode[]): Beat[] => {
  const beats: Beat[] = []
  let i = 0
  while (i < children.length) {
    const node = children[i]
    if (node.type === 'choice') {
      const group: ChoiceNode[] = []
      const start = i
      while (i < children.length && children[i]?.type === 'choice') {
        group.push(children[i] as ChoiceNode)
        i++
      }
      beats.push({ kind: 'decision', nodes: group, startIndex: start })
      continue
    }
    if (node.type === 'dialogue') beats.push({ kind: 'dialogue', node, index: i })
    else if (node.type === 'goto') beats.push({ kind: 'goto', node, index: i })
    else if (node.type === 'marker') beats.push({ kind: 'marker', node, index: i })
    i++
  }
  return beats
}

const POSITIONS: Position[] = ['left', 'right', 'center']
const posLabel = (p: Position): string => ({ left: '左', right: '右', center: '中' })[p]

const inputCls =
  'w-full bg-transparent border border-border rounded-lg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors'

export const BeatCardEditor = ({ embedded = false }: { embedded?: boolean }): JSX.Element => {
  const scriptAst = useUiStore((s) => s.scriptAst)
  const scriptDiagnostics = useUiStore((s) => s.scriptDiagnostics)
  const scriptDirty = useUiStore((s) => s.scriptDirty)
  const selectedSceneId = useUiStore((s) => s.selectedSceneId)
  const editScriptAst = useUiStore((s) => s.editScriptAst)
  const setSelectedSceneId = useUiStore((s) => s.setSelectedSceneId)
  const { saving, scheduleSave } = useScriptSave()
  const float = usePanelFloat()

  // 选中场景(缺省取第一个)
  const scenes = useMemo(
    () => (scriptAst ? collectNodes(scriptAst, (n): n is SceneNode => n.type === 'scene') : []),
    [scriptAst]
  )
  const scene = useMemo<SceneNode | null>(() => {
    if (scenes.length === 0) return null
    return scenes.find((s) => s.id === selectedSceneId) ?? scenes[0] ?? null
  }, [scenes, selectedSceneId])

  // 首次载入后默认选中第一个场景
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

  /** 定位场景内 children 并改写(按 beat 的起始索引) */
  const mutateSceneChildren = (
    ast: ScriptNode,
    fn: (children: AstNode[], sceneId: string) => void
  ): void => {
    const target = collectNodes(ast, (n): n is SceneNode => n.type === 'scene').find(
      (s) => s.id === scene?.id
    )
    if (target) {
      fn(target.children, target.id)
      return
    }
    // 场景不存在(平铺层):落到 root.children
    fn(ast.children, '')
  }

  // —— 编辑操作 ——
  const updateDialogue = (idx: number, patch: Partial<DialogueNode>): void => {
    commit((ast) => {
      mutateSceneChildren(ast, (children) => {
        const n = children[idx]
        if (n?.type === 'dialogue') Object.assign(n, patch)
      })
    })
  }

  const updateOption = (
    groupStart: number,
    optionIdx: number,
    patch: Partial<{ text: string; target: string }>
  ): void => {
    commit((ast) => {
      mutateSceneChildren(ast, (children) => {
        const n = children[groupStart + optionIdx]
        if (n?.type === 'choice' && n.options[0]) Object.assign(n.options[0], patch)
      })
    })
  }

  const addOption = (groupStart: number): void => {
    commit((ast) => {
      mutateSceneChildren(ast, (children) => {
        const node: ChoiceNode = {
          type: 'choice',
          line: 0,
          column: 1,
          options: [{ text: '新选项', target: '' }]
        }
        // 插在该决策组末尾(保持连续)
        let end = groupStart
        while (end < children.length && children[end]?.type === 'choice') end++
        children.splice(end, 0, node)
      })
    })
  }

  const removeOption = (groupStart: number, optionIdx: number): void => {
    commit((ast) => {
      mutateSceneChildren(ast, (children) => {
        children.splice(groupStart + optionIdx, 1)
      })
    })
  }

  const removeBeat = (start: number, count: number): void => {
    commit((ast) => {
      mutateSceneChildren(ast, (children) => {
        children.splice(start, count)
      })
    })
  }

  const moveBeat = (start: number, count: number, dir: -1 | 1): void => {
    commit((ast) => {
      mutateSceneChildren(ast, (children) => {
        const target = dir === -1 ? start - 1 : start + count
        if (target < 0 || target >= children.length) return
        const moved = children.splice(start, count)
        children.splice(target, 0, ...moved)
      })
    })
  }

  const addBeat = (kind: Beat['kind']): void => {
    commit((ast) => {
      mutateSceneChildren(ast, (children) => {
        let node: AstNode
        if (kind === 'dialogue') {
          node = { type: 'dialogue', character: '角色', lines: [''], line: 0, column: 1 } as DialogueNode
        } else if (kind === 'decision') {
          node = { type: 'choice', line: 0, column: 1, options: [{ text: '新选项', target: '' }] }
        } else if (kind === 'goto') {
          node = { type: 'goto', target: '', line: 0, column: 1 } as GotoNode
        } else {
          node = { type: 'marker', id: '新标记', line: 0, column: 1 } as MarkerNode
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

      {/* 场景内元数据:背景 / BGM 可编辑 */}
      {scene ? (
        <div className="px-3 py-2 grid grid-cols-2 gap-2 bg-bg-elevated/50 border-b border-border">
          <label className="flex items-center gap-1.5 text-[11px] text-text-muted">
            背景
            <input
              className={inputCls}
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
              className={inputCls}
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

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
        {beats.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-text-muted text-sm gap-3">
            <p>该场景还没有内容</p>
          </div>
        ) : (
          beats.map((beat) => {
            if (beat.kind === 'dialogue') {
              return (
                <div
                  key={beat.index}
                  className="rounded-xl border border-border bg-bg p-3 space-y-2 hover:border-accent/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                    <input
                      className={cn(inputCls, 'flex-1 font-medium')}
                      value={beat.node.character}
                      onChange={(e) => updateDialogue(beat.index, { character: e.target.value })}
                    />
                    <select
                      className={cn(inputCls, 'w-20')}
                      value={beat.node.position ?? ''}
                      onChange={(e) =>
                        updateDialogue(beat.index, {
                          position: (e.target.value || undefined) as Position | undefined
                        })
                      }
                    >
                      <option value="">位置</option>
                      {POSITIONS.map((p) => (
                        <option key={p} value={p}>
                          {posLabel(p)}
                        </option>
                      ))}
                    </select>
                    <BeatActions
                      onUp={() => moveBeat(beat.index, 1, -1)}
                      onDown={() => moveBeat(beat.index, 1, 1)}
                      onDelete={() => removeBeat(beat.index, 1)}
                    />
                  </div>
                  <input
                    className={cn(inputCls, 'text-[12px]')}
                    value={beat.node.sprite ?? ''}
                    placeholder="立绘资源(可空)"
                    onChange={(e) => updateDialogue(beat.index, { sprite: e.target.value || undefined })}
                  />
                  <textarea
                    className={cn(inputCls, 'resize-none min-h-[44px]')}
                    value={beat.node.lines[0] ?? ''}
                    placeholder="对白文本"
                    rows={2}
                    onChange={(e) => updateDialogue(beat.index, { lines: [e.target.value] })}
                  />
                </div>
              )
            }
            if (beat.kind === 'decision') {
              return (
                <div
                  key={beat.startIndex}
                  className="rounded-xl border border-accent/30 bg-accent-soft/30 p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                    <span className="text-xs font-medium text-text">决策 · {beat.nodes.length} 选项</span>
                    <div className="flex-1" />
                    <BeatActions
                      onUp={() => moveBeat(beat.startIndex, beat.nodes.length, -1)}
                      onDown={() => moveBeat(beat.startIndex, beat.nodes.length, 1)}
                      onDelete={() => removeBeat(beat.startIndex, beat.nodes.length)}
                    />
                  </div>
                  {beat.nodes.map((choice, oi) => (
                    <div key={oi} className="flex items-center gap-1.5">
                      <CornerDownRight className="w-3 h-3 text-text-muted flex-shrink-0" />
                      <input
                        className={cn(inputCls, 'flex-1')}
                        value={choice.options[0]?.text ?? ''}
                        placeholder="选项文本"
                        onChange={(e) => updateOption(beat.startIndex, oi, { text: e.target.value })}
                      />
                      <span className="text-text-muted text-xs">→</span>
                      <input
                        className={cn(inputCls, 'w-32')}
                        value={choice.options[0]?.target ?? ''}
                        placeholder="目标场景"
                        onChange={(e) => updateOption(beat.startIndex, oi, { target: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => removeOption(beat.startIndex, oi)}
                        className="h-7 w-7 rounded-md flex items-center justify-center text-text-muted hover:text-danger hover:bg-surface"
                        aria-label="删除选项"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addOption(beat.startIndex)}
                    className="flex items-center gap-1 text-[12px] text-accent hover:text-accent-hover"
                  >
                    <Plus className="w-3 h-3" />
                    添加选项
                  </button>
                </div>
              )
            }
            if (beat.kind === 'goto') {
              return (
                <div
                  key={beat.index}
                  className="rounded-xl border border-border bg-bg p-3 flex items-center gap-2"
                >
                  <CornerDownRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                  <span className="text-xs text-text-muted">跳转 →</span>
                  <input
                    className={cn(inputCls, 'flex-1')}
                    value={beat.node.target}
                    placeholder="目标场景"
                    onChange={(e) =>
                      commit((ast) => {
                        mutateSceneChildren(ast, (children) => {
                          const n = children[beat.index]
                          if (n?.type === 'goto') n.target = e.target.value
                        })
                      })
                    }
                  />
                  <BeatActions
                    onUp={() => moveBeat(beat.index, 1, -1)}
                    onDown={() => moveBeat(beat.index, 1, 1)}
                    onDelete={() => removeBeat(beat.index, 1)}
                  />
                </div>
              )
            }
            // marker
            return (
              <div
                key={beat.index}
                className="rounded-xl border border-dashed border-border bg-bg p-3 flex items-center gap-2"
              >
                <Anchor className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                <span className="text-xs text-text-muted">标记</span>
                <input
                  className={cn(inputCls, 'flex-1')}
                  value={beat.node.id}
                  placeholder="标记 id"
                  onChange={(e) =>
                    commit((ast) => {
                      mutateSceneChildren(ast, (children) => {
                        const n = children[beat.index]
                        if (n?.type === 'marker') n.id = e.target.value
                      })
                    })
                  }
                />
                <BeatActions
                  onUp={() => moveBeat(beat.index, 1, -1)}
                  onDown={() => moveBeat(beat.index, 1, 1)}
                  onDelete={() => removeBeat(beat.index, 1)}
                />
              </div>
            )
          })
        )}
      </div>

      {/* 添加 beat 工具条 */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-t border-border bg-bg-elevated">
        <span className="text-[11px] text-text-muted mr-1">添加</span>
        <AddBtn label="对白" icon={MessageSquare} onClick={() => addBeat('dialogue')} />
        <AddBtn label="决策" icon={GitBranch} onClick={() => addBeat('decision')} />
        <AddBtn label="跳转" icon={CornerDownRight} onClick={() => addBeat('goto')} />
        <AddBtn label="标记" icon={Anchor} onClick={() => addBeat('marker')} />
      </div>
    </section>
  )
}

const BeatActions = ({
  onUp,
  onDown,
  onDelete
}: {
  onUp: () => void
  onDown: () => void
  onDelete: () => void
}): JSX.Element => (
  <div className="flex items-center gap-0.5 flex-shrink-0">
    <button
      type="button"
      onClick={onUp}
      className="h-7 w-6 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface"
      aria-label="上移"
    >
      <ChevronUp className="w-3.5 h-3.5" />
    </button>
    <button
      type="button"
      onClick={onDown}
      className="h-7 w-6 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface"
      aria-label="下移"
    >
      <ChevronDown className="w-3.5 h-3.5" />
    </button>
    <button
      type="button"
      onClick={onDelete}
      className="h-7 w-6 rounded-md flex items-center justify-center text-text-muted hover:text-danger hover:bg-surface"
      aria-label="删除"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  </div>
)

const AddBtn = ({
  label,
  icon: Icon,
  onClick
}: {
  label: string
  icon: typeof Plus
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
