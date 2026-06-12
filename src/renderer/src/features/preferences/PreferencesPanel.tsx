import {
  Sparkles,
  Volume2,
  Code2,
  Download,
  Palette,
  GitBranch,
  Folder,
  Keyboard,
  Settings
} from 'lucide-react'
import { useUiStore } from '../../lib/store'
import type { PreferencesSection } from '@shared/preferences'
import { cn } from '../../lib/utils'

const SECTIONS: { id: PreferencesSection; label: string; icon: typeof Sparkles }[] = [
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'voice', label: '语音', icon: Volume2 },
  { id: 'editor', label: '编辑器', icon: Code2 },
  { id: 'export', label: '导出', icon: Download },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'git', label: 'Git', icon: GitBranch },
  { id: 'project', label: '项目', icon: Folder },
  { id: 'shortcuts', label: '快捷键', icon: Keyboard },
  { id: 'advanced', label: '高级', icon: Settings }
]

export const PreferencesSidebar = (): JSX.Element => {
  const current = useUiStore((s) => s.preferencesSection)
  const setSection = (section: PreferencesSection): void => {
    useUiStore.setState({ preferencesSection: section })
  }
  return (
    <aside className="w-56 bg-surface border-r border-border p-2 space-y-0.5">
      {SECTIONS.map((s) => {
        const Icon = s.icon
        const isActive = current === s.id
        return (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors',
              isActive
                ? 'bg-accent-soft text-accent font-medium'
                : 'text-text-muted hover:bg-bg-elevated hover:text-text'
            )}
          >
            <Icon className="w-4 h-4" />
            {s.label}
          </button>
        )
      })}
    </aside>
  )
}
