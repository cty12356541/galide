import { TitleBar } from './TitleBar'
import { EditorArea } from './EditorArea'
import { StatusBar } from './StatusBar'
import { WelcomeScreen } from './WelcomeScreen'
import { AiPanel } from '../features/ai-panel/AiPanel'
import { CommandPalette } from '../features/command-palette/CommandPalette'
import { PreferencesDialog } from '../features/preferences/PreferencesDialog'
import { ExportDialog } from '../features/export/ExportDialog'
import { CommitDialog } from '../features/git/CommitDialog'
import { useUiStore } from '../lib/store'
import { useEffect } from 'react'

export const App = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const aiPanelOpen = useUiStore((s) => s.aiPanelOpen)
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen)
  const preferencesOpen = useUiStore((s) => s.preferencesOpen)
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette)
  const openPreferences = useUiStore((s) => s.openPreferences)
  const closePreferences = useUiStore((s) => s.closePreferences)
  // P1-3 修复: 录制快捷键时,App 级 keydown 应当 early-return,
  // 否则 Esc 会同时被外层和 useShortcutRecorder 抢走。
  const shortcutRecording = useUiStore((s) => s.shortcutRecording)

  // P1-10 修复: 删掉这里的 useEffect — 主题切换 DOM 副作用由 useUiStore.setTheme 集中处理,
  // 不在 App 重复一份,避免双重 toggle 导致首次进入不生效。

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // 录制中:让 useShortcutRecorder 全权处理,这里不拦任何键
      if (shortcutRecording) return
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        toggleCommandPalette()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        openPreferences()
        return
      }
      if (e.key === 'Escape' && preferencesOpen) {
        e.preventDefault()
        closePreferences()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleCommandPalette, openPreferences, closePreferences, preferencesOpen, shortcutRecording])

  if (preferencesOpen) {
    return <PreferencesDialog />
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-bg text-text">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden">
        {projectPath ? (
          <>
            <EditorArea />
            {aiPanelOpen && <AiPanel />}
          </>
        ) : (
          <WelcomeScreen />
        )}
      </div>
      <StatusBar />
      {commandPaletteOpen && <CommandPalette />}
      {projectPath && <ExportDialog />}
      {projectPath && <CommitDialog />}
    </div>
  )
}
