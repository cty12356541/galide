/**
 * ReplacePreviewDialog — 跨文件替换的预览确认对话框
 *
 * 按文件分组展示匹配(行:列 + 上下文 + token 类型),全部默认勾选、可逐项取消;
 * 确认时只回传勾选项 — main 端只应用回传的精确匹配,绝不盲替。
 */
import { useEffect, useMemo, useState } from 'react'
import { FileText, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { ScrollArea } from '../../components/ui/scroll-area'
import type { ScriptReplaceMatch } from '../../../../shared/dsl/replace-in-scripts.js'

export type ReplacePreviewDialogProps = {
  open: boolean
  matches: ScriptReplaceMatch[]
  truncated: boolean
  applying: boolean
  onCancel: () => void
  onConfirm: (selected: ScriptReplaceMatch[]) => void
}

export const ReplacePreviewDialog = ({
  open,
  matches,
  truncated,
  applying,
  onCancel,
  onConfirm
}: ReplacePreviewDialogProps): JSX.Element => {
  const [uncheckedIds, setUncheckedIds] = useState<ReadonlySet<string>>(new Set())

  // 每批新匹配重置勾选状态(默认全选)
  useEffect(() => {
    setUncheckedIds(new Set())
  }, [matches])

  const grouped = useMemo(() => {
    const map = new Map<string, ScriptReplaceMatch[]>()
    for (const m of matches) {
      const list = map.get(m.file) ?? []
      list.push(m)
      map.set(m.file, list)
    }
    return [...map.entries()]
  }, [matches])

  const toggle = (id: string): void => {
    setUncheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selected = matches.filter((m) => !uncheckedIds.has(m.id))

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl" data-testid="replace-preview-dialog">
        <DialogHeader>
          <DialogTitle>替换预览</DialogTitle>
          <DialogDescription>
            共 {matches.length} 处匹配,{grouped.length} 个文件。取消勾选可跳过单处。
          </DialogDescription>
        </DialogHeader>
        {truncated ? (
          <div
            className="flex items-center gap-1.5 rounded-md bg-warning-soft px-2.5 py-1.5 text-[11px] text-warning-strong"
            data-testid="replace-truncated-notice"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            匹配过多,仅显示前 {matches.length} 处;本次只会替换显示中的勾选项。
          </div>
        ) : null}
        <ScrollArea className="max-h-[50vh] rounded-md border border-border">
          <div className="p-2 space-y-2">
            {grouped.map(([file, fileMatches]) => (
              <div key={file}>
                <div className="flex items-center gap-1.5 px-1.5 py-1 text-[10px] font-mono text-accent">
                  <FileText className="h-3 w-3" />
                  {file}
                  <span className="text-text-muted">({fileMatches.length})</span>
                </div>
                <div className="space-y-0.5">
                  {fileMatches.map((m) => (
                    <label
                      key={m.id}
                      className="flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-bg-elevated cursor-pointer"
                      data-testid="replace-preview-match"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent"
                        checked={!uncheckedIds.has(m.id)}
                        onChange={() => toggle(m.id)}
                        data-testid="replace-preview-checkbox"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-[10px] font-mono text-text-muted">
                          {m.line}:{m.column}
                          {m.tokenKind !== 'plain' ? (
                            <span className="ml-1.5 rounded-sm bg-accent-soft px-1 py-px text-accent">
                              {m.tokenKind}
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-[11px] text-text">{m.context}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <span className="mr-auto self-center text-[11px] text-text-muted" data-testid="replace-selected-count">
            已选 {selected.length}/{matches.length}
          </span>
          <Button variant="ghost" onClick={onCancel} disabled={applying}>
            取消
          </Button>
          <Button
            onClick={() => onConfirm(selected)}
            disabled={applying || selected.length === 0}
            data-testid="replace-confirm-button"
          >
            {applying ? '替换中…' : `确认替换 (${selected.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
