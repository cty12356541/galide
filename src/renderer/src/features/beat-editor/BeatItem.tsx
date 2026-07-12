/**
 * BeatItem — individual beat row components for each beat kind (non-recursive)
 */
import {
  MessageSquare,
  GitBranch,
  Anchor,
  CornerDownRight,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Variable,
  GitMerge
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { serializeExpression, parseExpression } from '../../../../shared/dsl/expression'
import type { SetOp } from '../../../../shared/dsl/types'
import type { Beat } from './group-beats'
import type { BeatListMutators } from './useBeatList'

export const inputCls =
  'w-full bg-transparent border border-border rounded-lg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors'

const POSITIONS = ['left', 'right', 'center'] as const
type Position = (typeof POSITIONS)[number]
const posLabel = (p: Position): string => ({ left: '左', right: '右', center: '中' })[p]

// ── BeatActions ──

export const BeatActions = ({
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

// ── BeatAddToolbar ──

export const BeatAddToolbar = ({
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

// ── Beat card components ──

export const BeatDialogueCard = ({
  beat,
  updateDialogue,
  moveBeat,
  removeBeat
}: {
  beat: Beat & { kind: 'dialogue' }
  updateDialogue: BeatListMutators['updateDialogue']
  moveBeat: BeatListMutators['moveBeat']
  removeBeat: BeatListMutators['removeBeat']
}): JSX.Element => (
  <div className="rounded-xl border border-border bg-bg p-3 space-y-2 hover:border-accent/40 transition-colors">
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
        onChange={(e) => updateDialogue(beat.index, { position: (e.target.value || undefined) as Position | undefined })}
      >
        <option value="">位置</option>
        {POSITIONS.map((p) => (
          <option key={p} value={p}>{posLabel(p)}</option>
        ))}
      </select>
      <BeatActions onUp={() => moveBeat(beat.index, 1, -1)} onDown={() => moveBeat(beat.index, 1, 1)} onDelete={() => removeBeat(beat.index, 1)} />
    </div>
    <input className={cn(inputCls, 'text-[12px]')} value={beat.node.sprite ?? ''} placeholder="立绘资源(可空)" onChange={(e) => updateDialogue(beat.index, { sprite: e.target.value || undefined })} />
    <textarea className={cn(inputCls, 'resize-none min-h-[44px]')} value={beat.node.lines[0] ?? ''} placeholder="对白文本" rows={2} onChange={(e) => updateDialogue(beat.index, { lines: [e.target.value] })} />
  </div>
)

export const BeatDecisionCard = ({
  beat,
  updateOption,
  addOption,
  removeOption,
  moveBeat,
  removeBeat
}: {
  beat: Beat & { kind: 'decision' }
  updateOption: BeatListMutators['updateOption']
  addOption: BeatListMutators['addOption']
  removeOption: BeatListMutators['removeOption']
  moveBeat: BeatListMutators['moveBeat']
  removeBeat: BeatListMutators['removeBeat']
}): JSX.Element => (
  <div className="rounded-xl border border-accent/30 bg-accent-soft/30 p-3 space-y-2">
    <div className="flex items-center gap-2">
      <GitBranch className="w-3.5 h-3.5 text-accent flex-shrink-0" />
      <span className="text-xs font-medium text-text">决策 · {beat.nodes.length} 选项</span>
      <div className="flex-1" />
      <BeatActions onUp={() => moveBeat(beat.startIndex, beat.nodes.length, -1)} onDown={() => moveBeat(beat.startIndex, beat.nodes.length, 1)} onDelete={() => removeBeat(beat.startIndex, beat.nodes.length)} />
    </div>
    {beat.nodes.map((choice, oi) => (
      <div key={oi} className="flex items-center gap-1.5">
        <CornerDownRight className="w-3 h-3 text-text-muted flex-shrink-0" />
        <input className={cn(inputCls, 'flex-1')} value={choice.options[0]?.text ?? ''} placeholder="选项文本" onChange={(e) => updateOption(beat.startIndex, oi, { text: e.target.value })} />
        <span className="text-text-muted text-xs">→</span>
        <input className={cn(inputCls, 'w-32')} value={choice.options[0]?.target ?? ''} placeholder="目标场景" onChange={(e) => updateOption(beat.startIndex, oi, { target: e.target.value })} />
        <input className={cn(inputCls, 'w-36 text-[11px]')} value={choice.options[0]?.condition ? serializeExpression(choice.options[0].condition) : ''} placeholder="条件(可空)" title="[当: expr]" onChange={(e) => updateOption(beat.startIndex, oi, { conditionText: e.target.value })} />
        <button type="button" onClick={() => removeOption(beat.startIndex, oi)} className="h-7 w-7 rounded-md flex items-center justify-center text-text-muted hover:text-danger hover:bg-surface" aria-label="删除选项">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    ))}
    <button type="button" onClick={() => addOption(beat.startIndex)} className="flex items-center gap-1 text-[12px] text-accent hover:text-accent-hover">
      <Plus className="w-3 h-3" />添加选项
    </button>
  </div>
)

export const BeatSetCard = ({
  beat,
  mutateChildren,
  moveBeat,
  removeBeat
}: {
  beat: Beat & { kind: 'set' }
  mutateChildren: BeatListMutators['mutateChildren']
  moveBeat: BeatListMutators['moveBeat']
  removeBeat: BeatListMutators['removeBeat']
}): JSX.Element => (
  <div className="rounded-xl border border-warning/40 bg-warning-soft/20 p-3 space-y-2">
    <div className="flex items-center gap-2">
      <Variable className="w-3.5 h-3.5 text-warning flex-shrink-0" />
      <span className="text-xs font-medium text-text">设变量</span>
      <BeatActions onUp={() => moveBeat(beat.index, 1, -1)} onDown={() => moveBeat(beat.index, 1, 1)} onDelete={() => removeBeat(beat.index, 1)} />
    </div>
    <div className="flex items-center gap-2">
      <input className={cn(inputCls, 'w-28')} value={beat.node.name} placeholder="变量名" onChange={(e) => mutateChildren((c) => { const n = c[beat.index]; if (n?.type === 'set') n.name = e.target.value })} />
      <select className={cn(inputCls, 'w-20')} value={beat.node.op} onChange={(e) => mutateChildren((c) => { const n = c[beat.index]; if (n?.type === 'set') n.op = e.target.value as SetOp })}>
        <option value="set">=</option>
        <option value="add">+=</option>
        <option value="sub">-=</option>
      </select>
      <input className={cn(inputCls, 'flex-1 text-[12px]')} value={serializeExpression(beat.node.value)} placeholder="值/表达式" onChange={(e) => { const parsed = parseExpression(e.target.value); if (!parsed.ok) return; mutateChildren((c) => { const n = c[beat.index]; if (n?.type === 'set') n.value = parsed.expr }) }} />
    </div>
  </div>
)

export const BeatGotoCard = ({
  beat,
  mutateChildren,
  moveBeat,
  removeBeat
}: {
  beat: Beat & { kind: 'goto' }
  mutateChildren: BeatListMutators['mutateChildren']
  moveBeat: BeatListMutators['moveBeat']
  removeBeat: BeatListMutators['removeBeat']
}): JSX.Element => (
  <div className="rounded-xl border border-border bg-bg p-3 flex items-center gap-2">
    <CornerDownRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
    <span className="text-xs text-text-muted">跳转 →</span>
    <input className={cn(inputCls, 'flex-1')} value={beat.node.target} placeholder="目标场景" onChange={(e) => mutateChildren((c) => { const n = c[beat.index]; if (n?.type === 'goto') n.target = e.target.value })} />
    <BeatActions onUp={() => moveBeat(beat.index, 1, -1)} onDown={() => moveBeat(beat.index, 1, 1)} onDelete={() => removeBeat(beat.index, 1)} />
  </div>
)

export const BeatMarkerCard = ({
  beat,
  mutateChildren,
  moveBeat,
  removeBeat
}: {
  beat: Beat & { kind: 'marker' }
  mutateChildren: BeatListMutators['mutateChildren']
  moveBeat: BeatListMutators['moveBeat']
  removeBeat: BeatListMutators['removeBeat']
}): JSX.Element => (
  <div className="rounded-xl border border-dashed border-border bg-bg p-3 flex items-center gap-2">
    <Anchor className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
    <span className="text-xs text-text-muted">标记</span>
    <input className={cn(inputCls, 'flex-1')} value={beat.node.id} placeholder="标记 id" onChange={(e) => mutateChildren((c) => { const n = c[beat.index]; if (n?.type === 'marker') n.id = e.target.value })} />
    <BeatActions onUp={() => moveBeat(beat.index, 1, -1)} onDown={() => moveBeat(beat.index, 1, 1)} onDelete={() => removeBeat(beat.index, 1)} />
  </div>
)
