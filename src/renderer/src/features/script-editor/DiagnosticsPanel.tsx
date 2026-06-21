import { CheckCircle2, AlertCircle } from 'lucide-react'
import { ScrollArea } from '../../components/ui/scroll-area'
import { PanelHeader } from '../../components/ui/panel-header'
import { useScriptEditorJump } from '../../lib/hooks/use-script-editor-jump'
import type { ParseError } from '../../../../shared/dsl/types'

/**
 * P0-3 修复: 接收 props.items 而非自己调用 script.parse,
 * 避免 ScriptEditor 与 DiagnosticsPanel 各跑一份 parse(重复 IPC)。
 */
export const DiagnosticsPanel = ({ items }: { items: ParseError[] }): JSX.Element => {
  const jumpToEditor = useScriptEditorJump()

  return (
    <div className="bg-surface border-l border-border flex flex-col">
      <PanelHeader title="解析诊断" size="md" />
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {items.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-success py-2">
              <CheckCircle2 className="w-3.5 h-3.5" />
              无错误
            </div>
          ) : (
            items.map((item, i) => (
              <button
                key={`${item.line}-${item.column}-${i}`}
                type="button"
                onClick={() => jumpToEditor(item)}
                data-testid={`diagnostic-item-${item.line}`}
                className={`w-full text-left flex items-start gap-2 text-xs p-2 rounded-lg transition-colors hover:ring-1 hover:ring-accent/30 ${
                  item.severity === 'error'
                    ? 'bg-danger-soft text-danger-strong'
                    : 'bg-warning-soft text-warning-strong'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div>
                  <div className="font-mono text-[10px] opacity-70">
                    L{item.line}:{item.column}
                  </div>
                  <div>{item.message}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
