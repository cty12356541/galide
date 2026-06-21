import { AlertCircle } from 'lucide-react'
import { Button } from '../components/ui/button'
import { useUiStore } from './store'

export const isApiKeyRelatedError = (message: string): boolean =>
  /api\s*key|NO_API_KEY|未配置.*key|尚未配置/i.test(message)

interface AiErrorBannerProps {
  message: string
  /** When set, opens preferences at this section instead of default "ai". */
  preferencesSection?: 'ai' | 'voice'
}

export const AiErrorBanner = ({
  message,
  preferencesSection = 'ai'
}: AiErrorBannerProps): JSX.Element | null => {
  const openPreferences = useUiStore((s) => s.openPreferences)
  if (!message) return null

  const showKeyCta = isApiKeyRelatedError(message)

  return (
    <div
      className="flex items-start gap-2 text-[11px] text-danger-strong bg-danger-soft border border-danger/30 rounded-md px-2 py-1.5"
      data-testid="ai-error-banner"
    >
      <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <span className="break-all">{message}</span>
        {showKeyCta ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 text-[10px]"
            onClick={() => openPreferences(preferencesSection)}
          >
            配置 API Key
          </Button>
        ) : null}
      </div>
    </div>
  )
}
