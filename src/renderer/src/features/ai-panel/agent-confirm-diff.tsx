import { ScrollArea } from '../../components/ui/scroll-area'

interface AgentConfirmDiffProps {
  before: string
  after: string
}

/** Unified before/after preview for agent destructive tool confirm (panel-only). */
export const AgentConfirmDiff = ({ before, after }: AgentConfirmDiffProps): JSX.Element => (
  <div className="space-y-1.5" data-testid="agent-confirm-diff">
    <div className="text-[10px] font-medium text-text-muted">变更预览</div>
    <ScrollArea className="max-h-40 rounded-md border border-border bg-canvas">
      <div className="p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-all">
        {before === after ? (
          <span className="text-text-muted">(无文本差异)</span>
        ) : (
          <>
            <div className="text-danger mb-2">
              <span className="font-semibold">− 变更前</span>
              {'\n'}
              {before || '(空)'}
            </div>
            <div className="text-success">
              <span className="font-semibold">+ 变更后</span>
              {'\n'}
              {after || '(空)'}
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  </div>
)
