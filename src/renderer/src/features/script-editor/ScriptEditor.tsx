import { useEffect, useRef, useState } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { Save, Sparkles, AppWindow } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Separator } from '../../components/ui/separator'
import { useUiStore } from '../../lib/store'
import { useScriptSave } from '../../lib/hooks/use-script-save'
import { usePanelFloat } from '../../lib/hooks/use-panel-float'
import { toast } from '../../components/ui/toast'
import { DiagnosticsPanel } from './DiagnosticsPanel'
import { AiInlineEdit } from './AiInlineEdit'
import { galLanguage } from '../../lib/codemirror/gal-language'
import { cn } from '../../lib/utils'

interface ScriptEditorProps {
  /** 内嵌于 EditorSurfaceTabs,非浮窗 */
  embedded?: boolean
}

/**
 * P0-3 修复要点:
 * 1. EditorView 是 source of truth,React state 仅作 UI 镜像(dirty / saving)
 * 2. 解析错误由 DiagnosticsPanel 接收 parseDiagnostic 回调
 * 3. C1:统一 autosave 走 useScriptSave(debounce 800ms + ⌘S flush)
 */
export const ScriptEditor = ({ embedded = false }: ScriptEditorProps): JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const projectPath = useUiStore((s) => s.projectPath)
  const activeScript = useUiStore((s) => s.activeScriptFile)
  const scriptSource = useUiStore((s) => s.scriptSource)
  const scriptDirty = useUiStore((s) => s.scriptDirty)
  const scriptDiagnostics = useUiStore((s) => s.scriptDiagnostics)
  const scriptEditorScrollTarget = useUiStore((s) => s.scriptEditorScrollTarget)
  const setScriptEditorScrollTarget = useUiStore((s) => s.setScriptEditorScrollTarget)
  const editScriptSource = useUiStore((s) => s.editScriptSource)
  const { saving, scheduleSave, flushSave } = useScriptSave()
  const float = usePanelFloat()
  const [showAi, setShowAi] = useState(false)
  const saveRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!containerRef.current) return
    const onChange = (newContent: string): void => {
      if (newContent === useUiStore.getState().scriptSource) return
      editScriptSource(newContent)
      scheduleSave()
    }
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      keymap.of([
        {
          key: 'Mod-s',
          preventDefault: true,
          run: () => {
            void saveRef.current()
            return true
          }
        },
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap
      ]),
      search({ top: true }),
      highlightSelectionMatches(),
      galLanguage(),
      EditorView.lineWrapping,
      EditorView.theme(
        {
          '&': { height: '100%', fontSize: '14px', backgroundColor: 'transparent' },
          '.cm-content': { fontFamily: 'JetBrains Mono, monospace', padding: '12px 0' },
          '.cm-gutters': {
            backgroundColor: 'transparent',
            border: 'none',
            color: 'var(--cm-gutter-fg)'
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'transparent',
            color: 'var(--cm-active-line-gutter)'
          },
          '.cm-activeLine': { backgroundColor: 'var(--cm-active-line)' },
          '.cm-cursor': { borderLeftColor: 'var(--cm-cursor)' },
          '.cm-selectionBackground, ::selection': { backgroundColor: 'var(--cm-selection)' }
        },
        { dark: false }
      ),
      EditorView.updateListener.of((v) => {
        if (v.docChanged) onChange(v.state.doc.toString())
      })
    ]
    const state = EditorState.create({ doc: useUiStore.getState().scriptSource, extensions })
    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (scriptSource !== view.state.doc.toString()) {
      const sel = view.state.selection.main
      view.dispatch({
        changes: [{ from: 0, to: view.state.doc.length, insert: scriptSource }],
        selection: { anchor: Math.min(sel.anchor, scriptSource.length) }
      })
    }
  }, [scriptSource])

  useEffect(() => {
    const view = viewRef.current
    const target = scriptEditorScrollTarget
    if (!view || !target) return
    const doc = view.state.doc
    const lineNum = Math.min(Math.max(1, target.line), doc.lines)
    const line = doc.line(lineNum)
    const col = Math.min(Math.max(0, target.column - 1), line.length)
    const pos = line.from + col
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: 'center' })
    })
    setScriptEditorScrollTarget(null)
  }, [scriptEditorScrollTarget, scriptSource, setScriptEditorScrollTarget])

  const handleSave = async (): Promise<void> => {
    if (!projectPath || !activeScript) return
    await flushSave()
    if (!useUiStore.getState().scriptDirty) {
      toast({ message: '已保存', variant: 'success' })
    }
  }
  saveRef.current = handleSave

  const showHeader = !embedded

  return (
    <div className={cn('h-full flex flex-col', embedded ? 'bg-surface' : 'bg-bg')}>
      {showHeader ? (
        <div className="h-10 bg-surface border-b border-border flex items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-mono">{activeScript}</span>
            {scriptDirty ? (
              <span className="w-1.5 h-1.5 rounded-full bg-warning" title="未保存" />
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setShowAi(true)}>
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              AI
            </Button>
            <Separator orientation="vertical" className="h-4 mx-1" />
            <Button size="sm" onClick={handleSave} disabled={saving || !scriptDirty}>
              <Save className="w-3.5 h-3.5 mr-1" />
              {saving ? '保存中' : '保存'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="h-8 flex items-center justify-end gap-1 px-2 border-b border-border bg-bg-elevated flex-shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setShowAi(true)} title="AI 内联编辑" aria-label="AI 内联编辑">
            <Sparkles className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => float('script-editor')}
            title="浮出源码编辑"
            aria-label="浮出源码编辑"
            data-testid="source-float"
          >
            <AppWindow className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
      <div className={cn('flex-1 grid overflow-hidden', embedded ? 'grid-cols-[1fr_240px]' : 'grid-cols-[1fr_280px]')}>
        <div
          className="overflow-auto relative"
          data-testid="script-editor-cm-host"
          onClick={() => {
            if (showAi) setShowAi(false)
          }}
        >
          <div ref={containerRef} className="min-h-full" />
          {showAi && <AiInlineEdit onClose={() => setShowAi(false)} content={scriptSource} />}
        </div>
        <DiagnosticsPanel items={scriptDiagnostics} />
      </div>
    </div>
  )
}
