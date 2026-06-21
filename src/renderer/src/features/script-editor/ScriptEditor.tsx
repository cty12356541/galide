import { useEffect, useRef, useState } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { Save, Sparkles } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Separator } from '../../components/ui/separator'
import { useUiStore } from '../../lib/store'
import { useScript } from '../../lib/ipc/use-script'
import { toast } from '../../components/ui/toast'
import { DiagnosticsPanel } from './DiagnosticsPanel'
import { AiInlineEdit } from './AiInlineEdit'
import { galLanguage } from '../../lib/codemirror/gal-language'

const _defaultContent = `# 第一章:相遇

## 教室·午后
背景: assets/backgrounds/classroom.png
BGM: assets/bgm/gentle_piano.mp3

[角色:小雪 | 立绘:小雪_校服_微笑.png | 位置:左]
小雪: "今天的樱花,真漂亮呢。"

[角色:主角 | 立绘:主角_默认.png | 位置:右]
主角: "……是啊。"

* "邀请她一起看樱花" -> 樱花树下
* "假装没听到" -> 独自回家
* "问她喜欢什么花" -> 樱花雨

=== 樱花树下 ===
小雪: "诶?!一起吗?"
`

/**
 * P0-3 修复要点:
 * 1. EditorView 是 source of truth,React state 仅作 UI 镜像(dirty / saving)
 *    — 避免 content useState 与 EditorView 双向不同步。
 * 2. 解析错误不再 pushError 到 useErrorStore(每次按键污染全局),
 *    改由 DiagnosticsPanel 接收 parseDiagnostic 回调(组件内 state)。
 * 3. 解析 Promise 加 cancellation token,unmount 时取消,避免泄漏。
 */
export const ScriptEditor = (): JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const projectPath = useUiStore((s) => s.projectPath)
  const activeScript = useUiStore((s) => s.activeScriptFile)
  const scriptSource = useUiStore((s) => s.scriptSource)
  const scriptDirty = useUiStore((s) => s.scriptDirty)
  const scriptDiagnostics = useUiStore((s) => s.scriptDiagnostics)
  const editScriptSource = useUiStore((s) => s.editScriptSource)
  const markScriptSaved = useUiStore((s) => s.markScriptSaved)
  const script = useScript()
  const [saving, setSaving] = useState(false)
  const [showAi, setShowAi] = useState(false)
  // ⌘S 保存:keymap 在 mount 时创建一次,用 ref 持有最新 handleSave 避免闭包陈旧
  const saveRef = useRef<() => void>(() => {})

  // mount-only: 创建 EditorView,doc 初始来自 store.scriptSource
  useEffect(() => {
    if (!containerRef.current) return
    const onChange = (newContent: string): void => {
      // 外部回写(reconcile 把 doc 同步成 store 源串)会触发 docChanged → 回流。
      // 此时 newContent === store 源串 → 跳过:既避免清空重做栈(undo 后被回写清 future),
      // 也避免跨窗口载入后被误置脏。
      if (newContent === useUiStore.getState().scriptSource) return
      // 用户编辑 → 走源串入口(store 内 reparse,更新 ast/诊断/dirty)
      editScriptSource(newContent)
    }
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      keymap.of([
        { key: 'Mod-s', preventDefault: true, run: () => { void saveRef.current(); return true } },
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
          '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--cm-gutter-fg)' },
          '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--cm-active-line-gutter)' },
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

  // 外部变更(切文件 / 跨窗口广播 / 卡片编辑)→ reconcile doc,保留选区
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

  const handleSave = async (): Promise<void> => {
    const view = viewRef.current
    if (!view || !projectPath || !activeScript) return
    const text = view.state.doc.toString()
    setSaving(true)
    try {
      const r = await script.write(projectPath, activeScript, text)
      if (r && r.ok === true) {
        markScriptSaved()
        toast({ message: '已保存', variant: 'success' })
      } else if (r && r.ok !== true) {
        // wrapWrite 已经 pushError,这里只补充一行红 toast
        toast({
          message: r.code === 'COMMIT_FAILED' ? '保存成功,但 git commit 失败' : '保存失败',
          variant: 'error'
        })
      }
    } finally {
      setSaving(false)
    }
  }
  saveRef.current = handleSave

  return (
    <div className="h-full flex flex-col bg-bg">
      <div className="h-10 bg-surface border-b border-border flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
         <span className="text-xs text-text-muted font-mono">{activeScript}</span>
          {scriptDirty && <span className="w-1.5 h-1.5 rounded-full bg-warning" title="未保存" />}
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
      <div className="flex-1 grid grid-cols-[1fr_280px] overflow-hidden">
        <div
          className="overflow-auto relative"
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
