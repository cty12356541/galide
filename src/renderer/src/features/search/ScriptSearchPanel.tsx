/**
 * ScriptSearchPanel — 跨文件剧本全文搜索
 */
import { useCallback, useState } from 'react'
import { Search, Loader2, FileText } from 'lucide-react'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { ScrollArea } from '../../components/ui/scroll-area'
import { useUiStore } from '../../lib/store'

export const ScriptSearchPanel = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const setActiveScript = useUiStore((s) => s.setActiveScript)
  const setScriptEditorScrollTarget = useUiStore((s) => s.setScriptEditorScrollTarget)
  const showToolWindow = useUiStore((s) => s.showToolWindow)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
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
      <div className="p-2 border-b border-border flex gap-1.5">
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
    </div>
  )
}
