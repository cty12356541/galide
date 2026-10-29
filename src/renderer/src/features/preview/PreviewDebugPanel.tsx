/**
 * PreviewDebugPanel — 变量监视子岛(watch 列表 + 可折叠全变量表 + 变更闪变高亮)
 */
import { useState } from 'react'
import { Bug, Plus, X, ChevronDown, ChevronRight, Eye, Braces } from 'lucide-react'
import { PanelHeader } from '../../components/ui/panel-header'
import { EmptyState } from '../../components/ui/empty-state'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { useDebugStore } from './debug-store'
import { cn } from '../../lib/utils'

export interface PreviewDebugPanelProps {
  variables: Record<string, unknown>
  changedKeys: ReadonlySet<string>
}

const formatVarValue = (value: unknown): string => {
  if (value === undefined) return '<未定义>'
  if (typeof value === 'string') return JSON.stringify(value)
  return String(value)
}

export const PreviewDebugPanel = ({
  variables,
  changedKeys
}: PreviewDebugPanelProps): JSX.Element => {
  const watchNames = useDebugStore((s) => s.watchNames)
  const addWatch = useDebugStore((s) => s.addWatch)
  const removeWatch = useDebugStore((s) => s.removeWatch)

  const [watchDraft, setWatchDraft] = useState('')
  const [allVarsOpen, setAllVarsOpen] = useState(true)

  const sortedEntries = Object.entries(variables).sort(([a], [b]) => a.localeCompare(b))

  const handleAddWatch = (e: React.FormEvent): void => {
    e.preventDefault()
    const trimmed = watchDraft.trim()
    if (!trimmed) return
    addWatch(trimmed)
    setWatchDraft('')
  }

  return (
    <aside
      data-testid="preview-debug-panel"
      className="w-64 shrink-0 border-l border-border bg-surface flex flex-col min-h-0"
    >
      <PanelHeader title="变量监视" icon={Bug} subtitle={sortedEntries.length} size="sm" />

      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border">
        {/* Watch 列表 */}
        <section className="p-2.5 space-y-2">
          <div className="text-[11px] font-medium text-text-muted">监视列表</div>
          <form onSubmit={handleAddWatch} className="flex items-center gap-1">
            <Input
              value={watchDraft}
              onChange={(e) => setWatchDraft(e.target.value)}
              placeholder="输入变量名..."
              data-testid="debug-watch-input"
              className="h-7 text-[12px] px-2 rounded-md"
            />
            <Button
              type="submit"
              variant="secondary"
              size="icon"
              data-testid="debug-watch-add"
              title="添加监视"
              className="h-7 w-7 shrink-0 rounded-md"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </form>

          {watchNames.length === 0 ? (
            <EmptyState
              icon={Eye}
              title="暂无监视项"
              description="添加变量名以定点追踪"
              className="py-3 px-2"
            />
          ) : (
            <div className="space-y-1">
              {watchNames.map((name) => {
                const hasVal = Object.prototype.hasOwnProperty.call(variables, name)
                const val = variables[name]
                const flashed = changedKeys.has(name)
                return (
                  <div
                    key={name}
                    data-testid={`debug-watch-row-${name}`}
                    data-flashed={flashed ? 'true' : 'false'}
                    className={cn(
                      'flex items-center justify-between gap-1.5 px-2 py-1 rounded-md text-[12px] font-mono transition-colors',
                      flashed
                        ? 'bg-accent-soft text-accent ring-1 ring-accent/40'
                        : 'bg-bg-elevated/60 text-text'
                    )}
                  >
                    <span className="truncate font-medium">{name}</span>
                    <div className="flex items-center gap-1 min-w-0">
                      <span
                        className={cn(
                          'truncate max-w-[96px]',
                          !hasVal && 'text-text-muted italic font-sans text-[11px]'
                        )}
                        title={formatVarValue(val)}
                      >
                        {formatVarValue(val)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeWatch(name)}
                        aria-label={`移除监视 ${name}`}
                        data-testid={`debug-watch-remove-${name}`}
                        className="p-0.5 rounded text-text-muted hover:text-text hover:bg-surface"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* 全变量表(可折叠) */}
        <section className="p-2.5 space-y-1.5">
          <button
            type="button"
            onClick={() => setAllVarsOpen((v) => !v)}
            aria-expanded={allVarsOpen}
            data-testid="debug-all-vars-toggle"
            className="w-full flex items-center justify-between text-[11px] font-medium text-text-muted hover:text-text transition-colors"
          >
            <span className="flex items-center gap-1">
              {allVarsOpen ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              <span>全部变量</span>
            </span>
            <span className="font-mono">{sortedEntries.length}</span>
          </button>

          {allVarsOpen ? (
            sortedEntries.length === 0 ? (
              <EmptyState icon={Braces} title="当前无变量" className="py-3 px-2" />
            ) : (
              <div className="space-y-1 pt-0.5" data-testid="debug-all-vars-list">
                {sortedEntries.map(([key, val]) => {
                  const flashed = changedKeys.has(key)
                  return (
                    <div
                      key={key}
                      data-testid={`debug-var-row-${key}`}
                      data-flashed={flashed ? 'true' : 'false'}
                      className={cn(
                        'flex items-center justify-between gap-2 px-2 py-1 rounded-md text-[12px] font-mono transition-colors',
                        flashed
                          ? 'bg-accent-soft text-accent ring-1 ring-accent/40'
                          : 'hover:bg-bg-elevated text-text'
                      )}
                    >
                      <span className="truncate text-text-muted">{key}</span>
                      <span className="truncate font-medium" title={formatVarValue(val)}>
                        {formatVarValue(val)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          ) : null}
        </section>
      </div>
    </aside>
  )
}
