import { useEffect, useRef, useState } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { Save, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Separator } from '../../components/ui/separator'
import { useUiStore } from '../../lib/store'
import { useScript } from '../../lib/ipc/use-script'
import { toast } from '../../components/ui/toast'
import { DiagnosticsPanel } from './DiagnosticsPanel'
import { AiInlineEdit } from './AiInlineEdit'
import { galLanguage } from '../../lib/codemirror/gal-language'

const defaultContent = `# 第一章:相遇

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
  const script = useScript()
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showAi, setShowAi] = useState(false)
  // 解析结果(供 DiagnosticsPanel 渲染);ScriptEditor 自己只持有回调 ref
  const [diagnostics, setDiagnostics] = useState<{
    items: { line: number; message: string; severity: 'error' | 'warning' }[]
    content: string
  }>({ items: [], content: defaultContent })
  const parseSeqRef = useRef(0)

  // mount-only: 创建 EditorView,内部 content 直接来自 doc
  useEffect(() => {
    if (!containerRef.current) return
    const onChange = (newContent: string): void => {
      setDirty(true)
      // P0-3 #3: 解析前递增 seq,旧 promise 回调被取消
      const seq = ++parseSeqRef.current
      void script.parse(newContent).then((result) => {
        if (seq !== parseSeqRef.current) return
        if (result === null || result === undefined) {
          setDiagnostics({ items: [], content: newContent })
          return
        }
        if (result.ok === true) {
          setDiagnostics({ items: [], content: newContent })
          return
        }
        // result.ok === false 分支(显式比较,避免 TS narrow 偶发失败)
        const errors = result.error
        setDiagnostics({
          items: errors.map((e) => ({
            line: e.line,
            message: e.message,
            severity: e.severity
          })),
          content: newContent
        })
      })
    }
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      galLanguage(),
      EditorView.lineWrapping,
      EditorView.theme(
        {
          '&': { height: '100%', fontSize: '14px' },
          '.cm-content': { fontFamily: 'JetBrains Mono, monospace', padding: '12px 0' },
          '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: '#a8a29e' },
          '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#7c3aed' },
          '.cm-activeLine': { backgroundColor: 'rgba(124, 58, 237, 0.04)' }
        },
        { dark: false }
      ),
      EditorView.updateListener.of((v) => {
        if (v.docChanged) onChange(v.state.doc.toString())
      })
    ]
    const state = EditorState.create({ doc: defaultContent, extensions })
    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    // 捕获到局部变量,cleanup 时读局部而非 ref.current(避免 ref 已变)
    const seq = parseSeqRef
    return () => {
      seq.current++ // 取消未完成 parse
      view.destroy()
      viewRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 切 activeScript 时:重新读文件,全量替换 doc
  useEffect(() => {
    if (!projectPath || !activeScript) return
    let cancelled = false
    void script.read(projectPath, activeScript).then((text) => {
      if (cancelled) return
      const view = viewRef.current
      if (view && text !== undefined && text !== view.state.doc.toString()) {
        view.dispatch({
          changes: [{ from: 0, to: view.state.doc.length, insert: text }]
        })
        setDirty(false)
        // 重置诊断
        setDiagnostics({ items: [], content: text })
      }
    })
    return () => {
      cancelled = true
    }
  }, [projectPath, activeScript, script])

  const handleSave = async (): Promise<void> => {
    const view = viewRef.current
    if (!view || !projectPath || !activeScript) return
    const text = view.state.doc.toString()
    setSaving(true)
    try {
      const r = await script.write(projectPath, activeScript, text)
      if (r && r.ok === true) {
        setDirty(false)
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

  return (
    <div className="h-full flex flex-col bg-bg">
      <div className="h-10 bg-surface border-b border-border flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted font-mono">{activeScript}</span>
          {dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="未保存" />}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setShowAi(true)}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Ctrl+K
          </Button>
          <Separator orientation="vertical" className="h-4 mx-1" />
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
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
          {showAi && <AiInlineEdit onClose={() => setShowAi(false)} content={diagnostics.content} />}
        </div>
        <DiagnosticsPanel items={diagnostics.items} />
      </div>
    </div>
  )
}
