/**
 * useKeyboardShortcuts — 全局快捷键 hook
 *
 * 设计:
 *   - App 顶层 mount 一次,监听 window keydown
 *   - 处理: ⌘K 命令面板, ⌘, 偏好, ⌘L AI 开关, ⌘1 Project 开关, ⌘E 导出, ⌘O 打开
 *   - 录制快捷键(PreferencesDialog)时 early-return
 */
import { useEffect } from 'react'
import { useUiStore } from '../store'

export const useKeyboardShortcuts = (): void => {
  const shortcutRecording = useUiStore((s) => s.shortcutRecording)
  const preferencesOpen = useUiStore((s) => s.preferencesOpen)
  const closePreferences = useUiStore((s) => s.closePreferences)
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette)
  const openPreferences = useUiStore((s) => s.openPreferences)
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel)
  const toggleAiPanel = useUiStore((s) => s.toggleAiPanel)
  const openExportDialog = useUiStore((s) => s.openExportDialog)
  const openNewProjectDialog = useUiStore((s) => s.openNewProjectDialog)
  const openCommitDialog = useUiStore((s) => s.openCommitDialog)
  const projectPath = useUiStore((s) => s.projectPath)

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (shortcutRecording) return
      const meta = e.metaKey || e.ctrlKey

      if (meta && e.key === 'k') {
        e.preventDefault()
        toggleCommandPalette()
        return
      }
      if (meta && e.key === ',') {
        e.preventDefault()
        openPreferences()
        return
      }
      if (e.key === 'Escape' && preferencesOpen) {
        e.preventDefault()
        closePreferences()
        return
      }
      if (meta && e.key === 'l') {
        e.preventDefault()
        toggleAiPanel()
        return
      }
      if (meta && e.key === '1') {
        e.preventDefault()
        toggleLeftPanel()
        return
      }
      if (meta && e.key === 'e' && projectPath) {
        e.preventDefault()
        openExportDialog()
        return
      }
      if (meta && e.key === 'n') {
        e.preventDefault()
        openNewProjectDialog()
        return
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === 'c' && projectPath) {
        e.preventDefault()
        openCommitDialog()
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    shortcutRecording,
    preferencesOpen,
    projectPath,
    closePreferences,
    toggleCommandPalette,
    openPreferences,
    toggleLeftPanel,
    toggleAiPanel,
    openExportDialog,
    openNewProjectDialog,
    openCommitDialog
  ])
}
