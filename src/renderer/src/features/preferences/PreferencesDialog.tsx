import { ArrowLeft, X } from 'lucide-react'
import { useUiStore } from '../../lib/store'
import { PreferencesSidebar } from './PreferencesPanel'
import { PreferencesContent } from './PreferencesContent'

export const PreferencesDialog = (): JSX.Element => {
  const closePreferences = useUiStore((s) => s.closePreferences)
  return (
    <div className="fixed inset-0 z-40 bg-bg flex flex-col">
      <div className="h-12 bg-surface border-b border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={closePreferences}
            className="p-1.5 rounded-md text-text-muted hover:bg-bg-elevated hover:text-text"
            title="返回 (Esc)"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-sm font-semibold">偏好设置</h1>
        </div>
        <button
          onClick={closePreferences}
          className="p-1.5 rounded-md text-text-muted hover:bg-bg-elevated hover:text-text"
          title="关闭"
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
  )
}
