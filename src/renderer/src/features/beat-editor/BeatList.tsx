/**
 * BeatList — 递归 beat 卡片列表(场景 / if 分支内复用)
 */
import { useCallback, useState } from 'react'
import {
  MessageSquare,
  GitBranch,
  Anchor,
  CornerDownRight,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Variable,
  GitMerge
} from 'lucide-react'
import { parseExpression, serializeExpression } from '../../../../shared/dsl/expression'
import type {
  AstNode,
  DialogueNode,
  IfNode,
  ScriptNode,
  SetNode,
  SetOp
} from '../../../../shared/dsl/types'
import { cn } from '../../lib/utils'
import { groupBeats, mapIfBranchesToEditableGroups, type Beat } from './group-beats'
import { mutateBeatChildren, type BeatLocator } from './beat-locator'

type Position = 'left' | 'right' | 'center'

const POSITIONS: Position[] = ['left', 'right', 'center']
const posLabel = (p: Position): string => ({ left: '左', right: '右', center: '中' })[p]

const inputCls =
  'w-full bg-transparent border border-border rounded-lg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors'

const nestedBorderCls = (depth: number): string => {
  if (depth <= 0) return ''
  const colors = ['border-accent/30', 'border-warning/30', 'border-violet-400/30']
  return cn('border-l-2 pl-3 ml-1', colors[(depth - 1) % colors.length])
}

export interface BeatListProps {
  children: AstNode[]
  sceneId: string
  locator: BeatLocator
  depth?: number
  commit: (mutator: (ast: ScriptNode) => void) => void
}

export const BeatList = ({
  children,
  sceneId,
  locator,
  depth = 0,
  commit
}: BeatListProps): JSX.Element => {
  const beats = groupBeats(children)
  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(() => new Set())

  const mutateChildren = useCallback(
    (fn: (c: AstNode[]) => void): void => {
      commit((ast) => mutateBeatChildren(ast, sceneId, locator, fn))
    },
    [commit, sceneId, locator]
  )

  const branchKey = (ifIndex: number, branchIndex: number): string =>
    `${locator.map((s) => JSON.stringify(s)).join('|')}:${ifIndex}:${branchIndex}`

  const toggleBranch = (key: string): void => {
    setCollapsedBranches((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const removeBeat = (start: number, count: number): void => {
    mutateChildren((c) => c.splice(start, count))
  }

  const moveBeat = (start: number, count: number, dir: -1 | 1): void => {
    mutateChildren((c) => {
      const target = dir === -1 ? start - 1 : start + count
      if (target < 0 || target >= c.length) return
      const moved = c.splice(start, count)
      c.splice(target, 0, ...moved)
    })
  }

  const addBeat = (kind: Beat['kind']): void => {
    mutateChildren((c) => {
      let node: AstNode
      if (kind === 'dialogue') {
        node = { type: 'dialogue', character: '角色', lines: [''], line: 0, column: 1 } as DialogueNode
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
        } as SetNode
      } else if (kind === 'conditional') {
        node = {
          type: 'if',
          line: 0,
          column: 1,
          branches: [
            { kind: 'if', condition: { kind: 'literal', value: true }, children: [] },
            { kind: 'else', children: [] }
          ]
        } as IfNode
      } else if (kind === 'goto') {
        node = { type: 'goto', target: '', line: 0, column: 1 }
      } else {
        node = { type: 'marker', id: '新标记', line: 0, column: 1 }
      }
      c.push(node)
    })
  }

  const updateDialogue = (idx: number, patch: Partial<DialogueNode>): void => {
    mutateChildren((c) => {
      const n = c[idx]
      if (n?.type === 'dialogue') Object.assign(n, patch)
    })
  }

  const updateOption = (
    groupStart: number,
    optionIdx: number,
    patch: Partial<{ text: string; target: string; conditionText: string }>
  ): void => {
    mutateChildren((c) => {
      const n = c[groupStart + optionIdx]
      if (n?.type === 'choice' && n.options[0]) {
        const { conditionText, ...rest } = patch
        Object.assign(n.options[0], rest)
        if (conditionText !== undefined) {
          if (!conditionText.trim()) {
            delete n.options[0].condition
          } else {
            const parsed = parseExpression(conditionText)
            if (parsed.ok) n.options[0].condition = parsed.expr
          }
        }
      }
    })
  }

  const addOption = (groupStart: number): void => {
    mutateChildren((c) => {
      const node = { type: 'choice' as const, line: 0, column: 1, options: [{ text: '新选项', target: '' }] }
      let end = groupStart
      while (end < c.length && c[end]?.type === 'choice') end++
      c.splice(end, 0, node)
    })
  }

  const removeOption = (groupStart: number, optionIdx: number): void => {
    mutateChildren((c) => c.splice(groupStart + optionIdx, 1))
  }

  const childLocator = (ifBeatIndex: number, branchIndex: number): BeatLocator => [
    ...locator,
    { kind: 'into-child', index: ifBeatIndex },
    { kind: 'into-branch', branchIndex }
  ]

  if (beats.length === 0) {
    return (
      <div className={cn('space-y-2', nestedBorderCls(depth))}>
        <p className="text-[11px] text-text-muted py-1">分支内暂无内容</p>
        <BeatAddToolbar onAdd={addBeat} compact />
      </div>
    )
  }

  return (
    <div className={cn('space-y-2.5', nestedBorderCls(depth))}>
      {beats.map((beat) => {
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
                  <input
                    className={cn(inputCls, 'w-36 text-[11px]')}
                    value={
                      choice.options[0]?.condition
                        ? serializeExpression(choice.options[0].condition)
                        : ''
                    }
                    placeholder="条件(可空)"
                    title="[当: expr]"
                    onChange={(e) =>
                      updateOption(beat.startIndex, oi, { conditionText: e.target.value })
                    }
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
        if (beat.kind === 'set') {
          return (
            <div
              key={beat.index}
              className="rounded-xl border border-warning/40 bg-warning-soft/20 p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <Variable className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                <span className="text-xs font-medium text-text">设变量</span>
                <BeatActions
                  onUp={() => moveBeat(beat.index, 1, -1)}
                  onDown={() => moveBeat(beat.index, 1, 1)}
                  onDelete={() => removeBeat(beat.index, 1)}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  className={cn(inputCls, 'w-28')}
                  value={beat.node.name}
                  placeholder="变量名"
                  onChange={(e) =>
                    mutateChildren((c) => {
                      const n = c[beat.index]
                      if (n?.type === 'set') n.name = e.target.value
                    })
                  }
                />
                <select
                  className={cn(inputCls, 'w-20')}
                  value={beat.node.op}
                  onChange={(e) =>
                    mutateChildren((c) => {
                      const n = c[beat.index]
                      if (n?.type === 'set') n.op = e.target.value as SetOp
                    })
                  }
                >
                  <option value="set">=</option>
                  <option value="add">+=</option>
                  <option value="sub">-=</option>
                </select>
                <input
                  className={cn(inputCls, 'flex-1 text-[12px]')}
                  value={serializeExpression(beat.node.value)}
                  placeholder="值/表达式"
                  onChange={(e) => {
                    const parsed = parseExpression(e.target.value)
                    if (!parsed.ok) return
                    mutateChildren((c) => {
                      const n = c[beat.index]
                      if (n?.type === 'set') n.value = parsed.expr
                    })
                  }}
                />
              </div>
            </div>
          )
        }
        if (beat.kind === 'conditional') {
          const branchGroups = mapIfBranchesToEditableGroups(beat.node)
          return (
            <div
              key={beat.index}
              className="rounded-xl border border-accent/40 bg-accent-soft/20 p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <GitMerge className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                <span className="text-xs font-medium text-text">
                  条件块 · {branchGroups.length} 分支
                </span>
                <BeatActions
                  onUp={() => moveBeat(beat.index, 1, -1)}
                  onDown={() => moveBeat(beat.index, 1, 1)}
                  onDelete={() => removeBeat(beat.index, 1)}
                />
              </div>
              {branchGroups.map((bg) => {
                const key = branchKey(beat.index, bg.branchIndex)
                const collapsed = collapsedBranches.has(key)
                return (
                  <div key={bg.branchIndex} className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[12px]">
                      <button
                        type="button"
                        onClick={() => toggleBranch(key)}
                        className="h-6 w-6 rounded flex items-center justify-center text-text-muted hover:text-text hover:bg-surface"
                        aria-label={collapsed ? '展开分支' : '折叠分支'}
                      >
                        {collapsed ? (
                          <ChevronRight className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <span className="text-text-muted w-14 flex-shrink-0">
                        {bg.kind === 'if' ? '若' : bg.kind === 'elif' ? '否则若' : '否则'}
                      </span>
                      {bg.kind !== 'else' ? (
                        <input
                          className={cn(inputCls, 'flex-1')}
                          value={bg.condition ? serializeExpression(bg.condition) : ''}
                          placeholder="条件表达式"
                          onChange={(e) => {
                            const parsed = parseExpression(e.target.value)
                            if (!parsed.ok) return
                            mutateChildren((c) => {
                              const n = c[beat.index]
                              if (n?.type === 'if') n.branches[bg.branchIndex]!.condition = parsed.expr
                            })
                          }}
                        />
                      ) : (
                        <span className="text-text-muted flex-1">(默认分支)</span>
                      )}
                      <span className="text-text-muted text-[11px]">{bg.beats.length} beat</span>
                    </div>
                    {!collapsed ? (
                      <BeatList
                        children={beat.node.branches[bg.branchIndex]?.children ?? []}
                        sceneId={sceneId}
                        locator={childLocator(beat.index, bg.branchIndex)}
                        depth={depth + 1}
                        commit={commit}
                      />
                    ) : null}
                  </div>
                )
              })}
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
                  mutateChildren((c) => {
                    const n = c[beat.index]
                    if (n?.type === 'goto') n.target = e.target.value
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
                mutateChildren((c) => {
                  const n = c[beat.index]
                  if (n?.type === 'marker') n.id = e.target.value
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
      })}
      {depth > 0 ? <BeatAddToolbar onAdd={addBeat} compact /> : null}
    </div>
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
    <button type="button" onClick={onUp} className="h-7 w-6 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface" aria-label="上移">
      <ChevronUp className="w-3.5 h-3.5" />
    </button>
    <button type="button" onClick={onDown} className="h-7 w-6 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface" aria-label="下移">
      <ChevronDown className="w-3.5 h-3.5" />
    </button>
    <button type="button" onClick={onDelete} className="h-7 w-6 rounded-md flex items-center justify-center text-text-muted hover:text-danger hover:bg-surface" aria-label="删除">
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  </div>
)

const BeatAddToolbar = ({
  onAdd,
  compact = false
}: {
  onAdd: (kind: Beat['kind']) => void
  compact?: boolean
}): JSX.Element => (
  <div className={cn('flex flex-wrap items-center gap-1', compact ? 'pt-1' : '')}>
    <span className="text-[10px] text-text-muted mr-0.5">添加</span>
    <AddBtn label="对白" icon={MessageSquare} onClick={() => onAdd('dialogue')} />
    <AddBtn label="决策" icon={GitBranch} onClick={() => onAdd('decision')} />
    <AddBtn label="设变量" icon={Variable} onClick={() => onAdd('set')} />
    <AddBtn label="条件" icon={GitMerge} onClick={() => onAdd('conditional')} />
    <AddBtn label="跳转" icon={CornerDownRight} onClick={() => onAdd('goto')} />
    <AddBtn label="标记" icon={Anchor} onClick={() => onAdd('marker')} />
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
    className="flex items-center gap-1 h-6 px-1.5 rounded-md text-[11px] text-text-muted hover:text-text hover:bg-surface transition-colors"
  >
    <Icon className="w-3 h-3" />
    {label}
  </button>
)

export { BeatAddToolbar }
