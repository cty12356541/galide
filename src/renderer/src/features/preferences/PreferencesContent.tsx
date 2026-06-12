import { useUiStore } from '../../lib/store'
import { AiPreferencesPanel } from './sections/AiPreferencesPanel'
import { VoicePreferencesPanel } from './sections/VoicePreferencesPanel'
import { EditorPreferencesPanel } from './sections/EditorPreferencesPanel'
import { ExportPreferencesPanel } from './sections/ExportPreferencesPanel'
import { AppearancePreferencesPanel } from './sections/AppearancePreferencesPanel'
import { GitPreferencesPanel } from './sections/GitPreferencesPanel'
import { ProjectPreferencesPanel } from './sections/ProjectPreferencesPanel'
import { ShortcutsPreferencesPanel } from './sections/ShortcutsPreferencesPanel'
import { AdvancedPreferencesPanel } from './sections/AdvancedPreferencesPanel'

export const PreferencesContent = (): JSX.Element => {
  const section = useUiStore((s) => s.preferencesSection)
  switch (section) {
    case 'ai': return <AiPreferencesPanel />
    case 'voice': return <VoicePreferencesPanel />
    case 'editor': return <EditorPreferencesPanel />
    case 'export': return <ExportPreferencesPanel />
    case 'appearance': return <AppearancePreferencesPanel />
    case 'git': return <GitPreferencesPanel />
    case 'project': return <ProjectPreferencesPanel />
    case 'shortcuts': return <ShortcutsPreferencesPanel />
    case 'advanced': return <AdvancedPreferencesPanel />
    default: return <AiPreferencesPanel />
  }
}
