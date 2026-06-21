/**
 * EditorSurfaceTabs — 卡片 / 源码主编辑面切换(C1)
 *
 * 默认卡片;源码 tab 内嵌 ScriptEditor(embed);切换至源码前 flush 待存。
 */
import { FileCode2, LayoutGrid } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'
import { BeatCardEditor } from '../../features/beat-editor/BeatCardEditor'
import { ScriptEditor } from '../../features/script-editor/ScriptEditor'
import { useUiStore } from '../../lib/store'

export const EditorSurfaceTabs = (): JSX.Element => {
  const editorSurface = useUiStore((s) => s.editorSurface)
  const scriptDirty = useUiStore((s) => s.scriptDirty)
  const flushPendingScriptSave = useUiStore((s) => s.flushPendingScriptSave)
  const setEditorSurface = useUiStore((s) => s.setEditorSurface)

  const handleSurfaceChange = (value: string): void => {
    const next = value === 'source' ? 'source' : 'cards'
    if (next === editorSurface) return
    void (async () => {
      if (next === 'source') await flushPendingScriptSave()
      setEditorSurface(next)
    })()
  }

  return (
    <div className="h-full flex flex-col bg-surface overflow-hidden rounded-xl" data-testid="editor-surface-tabs">
      <div className="h-9 flex items-center justify-between px-2 border-b border-border bg-bg-elevated flex-shrink-0">
        <Tabs value={editorSurface} onValueChange={handleSurfaceChange}>
          <TabsList className="h-8 bg-bg p-0.5">
            <TabsTrigger value="cards" className="h-7 px-2.5 text-[12px] gap-1.5" data-testid="surface-tab-cards">
              <LayoutGrid className="w-3.5 h-3.5" />
              卡片
            </TabsTrigger>
            <TabsTrigger value="source" className="h-7 px-2.5 text-[12px] gap-1.5" data-testid="surface-tab-source">
              <FileCode2 className="w-3.5 h-3.5" />
              源码
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {scriptDirty ? (
          <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" title="未保存" data-testid="surface-dirty" />
        ) : null}
      </div>
      <div className="flex-1 min-h-0">
        {editorSurface === 'cards' ? <BeatCardEditor embedded /> : <ScriptEditor embedded />}
      </div>
    </div>
  )
}
