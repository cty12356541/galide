import { CheckCircle2, AlertCircle } from 'lucide-react'
import { ScrollArea } from '../../components/ui/scroll-area'

type DiagnosticItem = {
  line: number
  message: string
  severity: 'error' | 'warning'
}

/**
 * P0-3 修复: 接收 props.items 而非自己调用 script.parse,
 * 避免 ScriptEditor 与 DiagnosticsPanel 各跑一份 parse(重复 IPC)。
 */
export const DiagnosticsPanel = ({ items }: { items: DiagnosticItem[] }): JSX.Element => {
  return (
    <div className="bg-surface border-l border-border flex flex-col">
      <div className="h-9 px-3 flex items-center text-[11px] uppercase tracking-wider text-text-muted font-medium">
        解析诊断
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {items.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-green-600 py-2">
              <CheckCircle2 className="w-3.5 h-3.5" />
              无错误
            </div>
          ) : (
            items.map((item, i) => (
              <div
                key={`${item.line}-${i}`}
                className={`flex items-start gap-2 text-xs p-2 rounded-lg ${
                  item.severity === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div>
                  <div className="font-mono text-[10px] opacity-70">L{item.line}</div>
                  <div>{item.message}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
