/**
 * BeatList — 递归 beat 卡片列表(场景 / if 分支内复用)
 */
import React, { useState } from 'react'
import { ChevronRight, ChevronDown, GitMerge } from 'lucide-react'
import { cn } from '../../lib/utils'
import { serializeExpression, parseExpression } from '../../../../shared/dsl/expression'
import type { AstNode, ScriptNode } from '../../../../shared/dsl/types'
import { groupBeats, mapIfBranchesToEditableGroups } from './group-beats'
import type { BeatLocator } from './beat-locator'
import { useBeatList } from './useBeatList'
import {
  BeatDialogueCard,
  BeatDecisionCard,
  BeatSetCard,
  BeatGotoCard,
  BeatMarkerCard,
  BeatActions,
  BeatAddToolbar
} from './BeatItem'

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

const BeatListInner = ({
  children,
  sceneId,
  locator,
  depth = 0,
  commit
}: BeatListProps): JSX.Element => {
  const beats = groupBeats(children)
  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(() => new Set())
  const mutators = useBeatList(sceneId, locator, commit)

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

  if (beats.length === 0) {
    return (
      <div className={cn('space-y-2', nestedBorderCls(depth))}>
        <p className="text-[11px] text-text-muted py-1">分支内暂无内容</p>
        <BeatAddToolbar onAdd={mutators.addBeat} compact />
      </div>
    )
  }

  return (
    <div className={cn('space-y-2.5', nestedBorderCls(depth))}>
      {beats.map((beat) => {
        if (beat.kind === 'dialogue') {
          return <BeatDialogueCard key={beat.index} beat={beat} updateDialogue={mutators.updateDialogue} moveBeat={mutators.moveBeat} removeBeat={mutators.removeBeat} />
        }
        if (beat.kind === 'decision') {
          return <BeatDecisionCard key={beat.startIndex} beat={beat} updateOption={mutators.updateOption} addOption={mutators.addOption} removeOption={mutators.removeOption} moveBeat={mutators.moveBeat} removeBeat={mutators.removeBeat} />
        }
        if (beat.kind === 'set') {
          return <BeatSetCard key={beat.index} beat={beat} mutateChildren={mutators.mutateChildren} moveBeat={mutators.moveBeat} removeBeat={mutators.removeBeat} />
        }
        if (beat.kind === 'conditional') {
          const branchGroups = mapIfBranchesToEditableGroups(beat.node)
          return (
            <div key={beat.index} className="rounded-xl border border-accent/40 bg-accent-soft/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <GitMerge className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                <span className="text-xs font-medium text-text">条件块 · {branchGroups.length} 分支</span>
                <BeatActions onUp={() => mutators.moveBeat(beat.index, 1, -1)} onDown={() => mutators.moveBeat(beat.index, 1, 1)} onDelete={() => mutators.removeBeat(beat.index, 1)} />
              </div>
              {branchGroups.map((bg) => {
                const key = branchKey(beat.index, bg.branchIndex)
                const collapsed = collapsedBranches.has(key)
                return (
                  <div key={bg.branchIndex} className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[12px]">
                      <button type="button" onClick={() => toggleBranch(key)} className="h-6 w-6 rounded flex items-center justify-center text-text-muted hover:text-text hover:bg-surface" aria-label={collapsed ? '展开分支' : '折叠分支'}>
                        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      <span className="text-text-muted w-14 flex-shrink-0">{bg.kind === 'if' ? '若' : bg.kind === 'elif' ? '否则若' : '否则'}</span>
                      {bg.kind !== 'else' ? (
                        <input className={cn('w-full bg-transparent border border-border rounded-lg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors', 'flex-1')} value={bg.condition ? serializeExpression(bg.condition) : ''} placeholder="条件表达式" onChange={(e) => { const parsed = parseExpression(e.target.value); if (!parsed.ok) return; mutators.mutateChildren((c) => { const n = c[beat.index]; if (n?.type === 'if') n.branches[bg.branchIndex]!.condition = parsed.expr }) }} />
                      ) : (
                        <span className="text-text-muted flex-1">(默认分支)</span>
                      )}
                      <span className="text-text-muted text-[11px]">{bg.beats.length} beat</span>
                    </div>
                    {!collapsed ? (
                      <BeatListInner children={beat.node.branches[bg.branchIndex]?.children ?? []} sceneId={sceneId} locator={mutators.childLocator(beat.index, bg.branchIndex)} depth={depth + 1} commit={commit} />
                    ) : null}
                  </div>
                )
              })}
            </div>
          )
        }
        if (beat.kind === 'goto') {
          return <BeatGotoCard key={beat.index} beat={beat} mutateChildren={mutators.mutateChildren} moveBeat={mutators.moveBeat} removeBeat={mutators.removeBeat} />
        }
        return <BeatMarkerCard key={beat.index} beat={beat} mutateChildren={mutators.mutateChildren} moveBeat={mutators.moveBeat} removeBeat={mutators.removeBeat} />
      })}
      {depth > 0 ? <BeatAddToolbar onAdd={mutators.addBeat} compact /> : null}
    </div>
  )
}

export default React.memo(BeatListInner)
