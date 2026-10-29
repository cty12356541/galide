/**
 * PreviewDebugBar — 预览调试控制条(继续 / 单步 / 停止)与断点命中 Banner
 */
import { Play, StepForward, Square, AlertCircle } from 'lucide-react'
import type { VmBreakpointHit } from '../../../../shared/preview/runtime-vm'
import { Button } from '../../components/ui/button'

export interface PreviewDebugBarProps {
  pausedAt: VmBreakpointHit | null
  breakpointCount: number
  canContinue: boolean
  canStep: boolean
  onContinue: () => void
  onStep: () => void
  onStop: () => void
}

export const PreviewDebugBar = ({
  pausedAt,
  breakpointCount,
  canContinue,
  canStep,
  onContinue,
  onStep,
  onStop
}: PreviewDebugBarProps): JSX.Element => (
  <div className="shrink-0" data-testid="preview-debug-bar">
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-surface border-b border-border text-[12px]">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={
            pausedAt
              ? 'w-2 h-2 rounded-full bg-danger ring-2 ring-danger/30 shrink-0'
              : 'w-2 h-2 rounded-full bg-accent shrink-0'
          }
        />
        <span className="text-text-muted truncate">
          {pausedAt ? '断点已暂停' : `调试就绪 · ${breakpointCount} 个断点`}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          type="button"
          variant={pausedAt ? 'default' : 'secondary'}
          size="sm"
          disabled={!canContinue}
          onClick={onContinue}
          data-testid="debug-continue"
          className="h-7 px-2.5 rounded-md text-[12px] gap-1"
          title="继续运行至下一断点或选项"
        >
          <Play className="w-3 h-3" />
          <span>继续</span>
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!canStep}
          onClick={onStep}
          data-testid="debug-step"
          className="h-7 px-2.5 rounded-md text-[12px] gap-1"
          title="单步推进"
        >
          <StepForward className="w-3 h-3" />
          <span>单步</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onStop}
          data-testid="debug-stop"
          className="h-7 px-2.5 rounded-md text-[12px] gap-1 text-text-muted hover:text-text"
          title="停止调试并重置当前场景"
        >
          <Square className="w-3 h-3" />
          <span>停止</span>
        </Button>
      </div>
    </div>

    {pausedAt ? (
      <div
        role="status"
        data-testid="debug-breakpoint-banner"
        className="flex items-center justify-between gap-2 px-3 py-1.5 bg-danger-soft border-b border-danger/30 text-danger text-[12px]"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="font-medium">命中断点:</span>
          <code className="font-mono font-semibold truncate">{pausedAt.markerId}</code>
        </div>
        <span className="text-[11px] font-mono opacity-80 shrink-0">{pausedAt.sceneId}</span>
      </div>
    ) : null}
  </div>
)
