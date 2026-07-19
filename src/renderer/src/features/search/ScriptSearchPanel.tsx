/**
 * ScriptSearchPanel — 跨文件剧本全文搜索 + 查找替换
 *
 * 替换流:输入 query/替换词 → 选模式(plain 纯文本 / token 词法边界)→
 * 「替换」拉取匹配 → ReplacePreviewDialog 预览(默认全选、可逐项取消)→
 * 确认 → main 端快照后应用 → toast 结果 → 搜索结果刷新。
 */
import { useCallback, useState } from 'react'
import { Search, Loader2, FileText, ReplaceAll } from 'lucide-react'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { ScrollArea } from '../../components/ui/scroll-area'
import { toast } from '../../components/ui/toast'
import { useUiStore } from '../../lib/store'
import { useScriptReplace } from '../../lib/ipc/use-script-replace'
import { ReplacePreviewDialog } from './ReplacePreviewDialog'
import type {
  ScriptReplaceMatch,
  ScriptReplaceMode
} from '../../../../shared/dsl/replace-in-scripts.js'

export const ScriptSearchPanel = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const setActiveScript = useUiStore((s) => s.setActiveScript)
  const setScriptEditorScrollTarget = useUiStore((s) => s.setScriptEditorScrollTarget)
  const showToolWindow = useUiStore((s) => s.showToolWindow)

  const { preview, apply } = useScriptReplace()

  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [mode, setMode] = useState<ScriptReplaceMode>('plain')
  const [searching, setSearching] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [previewMatches, setPreviewMatches] = useState<ScriptReplaceMatch[]>([])
  const [previewTruncated, setPreviewTruncated] = useState(false)
  const [hits, setHits] = useState<
    { file: string; line: number; column: number; snippet: string }[]
  >([])

  const runSearch = useCallback(async (): Promise<void> => {
    if (!projectPath || !query.trim()) {
      setHits([])
      return
    }
    setSearching(true)
    try {
      const r = await window.galide.script.searchProject(projectPath, query.trim())
      if (r.ok) setHits(r.hits)
    } finally {
      setSearching(false)
    }
  }, [projectPath, query])

  const runReplacePreview = useCallback(async (): Promise<void> => {
    if (!projectPath || !query.trim()) return
    setPreviewing(true)
    try {
      const r = await preview(projectPath, query.trim(), mode)
      if (!r) return
      if (!r.ok) {
        toast({ message: r.error, variant: 'error' })
        return
      }
      if (r.matches.length === 0) {
        toast({ message: '无匹配可替换', variant: 'default' })
        return
      }
      setPreviewMatches(r.matches)
      setPreviewTruncated(r.truncated)
      setDialogOpen(true)
    } finally {
      setPreviewing(false)
    }
  }, [projectPath, query, mode, preview])

  const confirmReplace = useCallback(
    async (selected: ScriptReplaceMatch[]): Promise<void> => {
      if (!projectPath || selected.length === 0) return
      setApplying(true)
      try {
        const r = await apply(
          projectPath,
          replacement,
          selected.map(({ id, file, start, end, matchedText }) => ({
            id,
            file,
            start,
            end,
            matchedText
          }))
        )
        if (!r) return
        if (!r.ok) {
          toast({ message: r.error, variant: 'error' })
          return
        }
        setDialogOpen(false)
        setPreviewMatches([])
        if (r.conflicts.length > 0) {
          toast({
            message: `已替换 ${r.applied} 处;${r.conflicts.length} 处因文件已变更被跳过`,
            variant: 'warning'
          })
        } else {
          toast({
            message: `已替换 ${r.applied} 处(${r.filesChanged.length} 个文件)`,
            variant: 'success'
          })
        }
        await runSearch()
      } finally {
        setApplying(false)
      }
    },
    [projectPath, replacement, apply, runSearch]
  )

  const openHit = (hit: { file: string; line: number; column: number }): void => {
    setActiveScript(hit.file)
    setScriptEditorScrollTarget({ line: hit.line, column: hit.column })
    showToolWindow('project')
  }

  if (!projectPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-text-muted text-sm">
        请先打开项目
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" data-testid="script-search-panel">
      <div className="p-2 border-b border-border space-y-1.5">
        <div className="flex gap-1.5">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch()
            }}
            placeholder="搜索 scripts/*.gal…"
            className="h-8 text-xs flex-1"
            data-testid="script-search-input"
          />
          <Button size="sm" disabled={searching} onClick={() => void runSearch()}>
            {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          </Button>
        </div>
        <div className="flex gap-1.5">
          <Input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder="替换为…"
            className="h-8 text-xs flex-1"
            data-testid="script-replace-input"
          />
          <div className="flex rounded-md border border-border overflow-hidden shrink-0">
            <button
              type="button"
              className={`h-8 px-2 text-[11px] ${mode === 'plain' ? 'bg-accent-soft text-accent' : 'text-text-muted'}`}
              onClick={() => setMode('plain')}
              data-testid="replace-mode-plain"
            >
              纯文本
            </button>
            <button
              type="button"
              className={`h-8 px-2 text-[11px] ${mode === 'token' ? 'bg-accent-soft text-accent' : 'text-text-muted'}`}
              onClick={() => setMode('token')}
              data-testid="replace-mode-token"
              title="词法边界:只替换完整 token(如角色名),不碰正文/注释中的子串"
            >
              Token
            </button>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={previewing || !query.trim()}
            onClick={() => void runReplacePreview()}
            data-testid="script-replace-button"
          >
            {previewing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ReplaceAll className="w-3.5 h-3.5" />
            )}
            替换
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {hits.length === 0 ? (
            <p className="text-[11px] text-text-muted px-2 py-3">
              {query.trim() ? '无匹配结果' : '输入关键词后搜索'}
            </p>
          ) : (
            hits.map((hit) => (
              <button
                key={`${hit.file}:${hit.line}:${hit.column}`}
                type="button"
                onClick={() => openHit(hit)}
                className="w-full text-left px-2 py-1.5 rounded-md hover:bg-bg-elevated"
                data-testid="script-search-hit"
              >
                <div className="flex items-center gap-1.5 text-[10px] text-accent font-mono">
                  <FileText className="w-3 h-3" />
                  {hit.file}:{hit.line}:{hit.column}
                </div>
                <div className="text-[11px] text-text truncate mt-0.5">{hit.snippet}</div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
      <ReplacePreviewDialog
        open={dialogOpen}
        matches={previewMatches}
        truncated={previewTruncated}
        applying={applying}
        onCancel={() => setDialogOpen(false)}
        onConfirm={(selected) => void confirmReplace(selected)}
      />
    </div>
  )
}
