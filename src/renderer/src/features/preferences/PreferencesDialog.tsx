import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useUiStore } from '../../lib/store'
import { PreferencesSidebar } from './PreferencesPanel'
import { PreferencesContent } from './PreferencesContent'

export const PreferencesDialog = (): JSX.Element => {
  const closePreferences = useUiStore((s) => s.closePreferences)
  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closePreferences()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closePreferences])

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex justify-end"
      onClick={closePreferences}
      role="dialog"
      aria-modal="true"
      aria-label="偏好设置"
      data-testid="preferences-dialog"
    >
      <div
        className="h-full w-[800px] max-w-[90vw] bg-surface shadow-xl flex flex-col border-l border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-12 bg-bg-elevated border-b border-border flex items-center justify-between px-4 flex-shrink-0">
          <h1 className="text-sm font-semibold">偏好设置</h1>
          <button
            onClick={closePreferences}
            className="p-1.5 rounded-md text-text-muted hover:bg-surface hover:text-text"
            title="关闭 (Esc)"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 flex overflow-hidden">
          <PreferencesSidebar />
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto p-8">
              <PreferencesContent />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
