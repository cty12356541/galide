/**
 * 项目级 parse 失败 banner — 与 export PARSE_FAILED 同源文案
 */
import { AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/utils'

const firstLine = (error: string): string => error.split('\n')[0]?.trim() ?? error

export const ProjectParseErrorBanner = ({
  error,
  className,
  testId = 'project-parse-error-banner'
}: {
  error: string
  className?: string
  testId?: string
}): JSX.Element => {
  const summary = firstLine(error)
  return (
    <div
      role="alert"
      data-testid={testId}
      title={error}
      className={cn(
        'flex items-start gap-2 px-3 py-2 bg-warning-soft/80 border border-warning/40 text-warning-strong text-[11px]',
        className
      )}
    >
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">剧本解析失败</div>
        <div className="truncate font-mono opacity-90">{summary}</div>
      </div>
    </div>
  )
}
