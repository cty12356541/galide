/**
 * App.tsx — 顶层布局(规约 workspace_layout 6 区域)
 *
 * 规约依据: .style-spec/layers/renderer/conventions.yaml#workspace_layout
 *   6 区域: title_bar / activity_bar / side_panel / center_tabs / right_dock / status_bar
 *   6 强约束 (Rule 1-6):
 *     1. 一个面板 = 一个 feature (ActivityBar 6 panel)
 *     2. 中央 Tab Group 走 dockview (DockviewCenterTabs)
 *     3. AI Panel 走 PanelGroup (右 dock,setRightDock('ai'))
 *     4. Workspace 切换原子事务 (applyWorkspacePreset)
 *     5. StatusBar 实时反映 (StatusBarWorkspaceIndicator)
 *     6. layout 序列化容错 (mergeWorkspaceLayout)
 *
 * 持久化:
 *   - 启动期 hydrate:useWorkspacePersistence().hydrate(projectPath)
 *   - workspaceLayout 变化:debounce 300ms 写盘(project + global 两层)
 *   - beforeunload 强制 flush 最后一笔
 */

import { useEffect, useRef } from 'react'
import { TitleBar } from './TitleBar'
import { StatusBar } from './StatusBar'
import { WelcomeScreen } from './WelcomeScreen'
import { AiPanel } from '../features/ai-panel/AiPanel'
import { CommandPalette } from '../features/command-palette/CommandPalette'
import { PreferencesDialog } from '../features/preferences/PreferencesDialog'
import { ExportDialog } from '../features/export/ExportDialog'
import { CommitDialog } from '../features/git/CommitDialog'
import { ActivityBar } from '../components/workspace/ActivityBar'
import { SidePanel } from '../components/workspace/SidePanel'
import { DockviewCenterTabs } from '../components/workspace/DockviewCenterTabs'
import { useUiStore } from '../lib/store'
import { useWorkspacePersistence } from '../lib/ipc/use-workspace'
import { useAppearanceEffect } from '../lib/ipc/use-appearance-effect'

const PERSIST_DEBOUNCE_MS = 300

export const App = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const aiPanelOpen = useUiStore((s) => s.aiPanelOpen)
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen)
  const preferencesOpen = useUiStore((s) => s.preferencesOpen)
  const workspaceLayout = useUiStore((s) => s.workspaceLayout)
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette)
  const openPreferences = useUiStore((s) => s.openPreferences)
  const closePreferences = useUiStore((s) => s.closePreferences)
  const shortcutRecording = useUiStore((s) => s.shortcutRecording)

  useAppearanceEffect()

  const persistence = useWorkspacePersistence()

  // P1-4 修复(2026-06-15): hydrate 期间不应触发 persist 写回。
  // skipNextPersistRef 防止 hydrate 写入的 store 触发 useEffect 写盘回磁盘。
  const skipNextPersistRef = useRef(true)
  const projectFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const globalFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 启动期 hydrate
  useEffect(() => {
    skipNextPersistRef.current = true
    void persistence.hydrate(projectPath).then((layout) => {
      useUiStore.getState().hydrateWorkspaceLayout(layout)
    })
  }, [projectPath, persistence])

  // 监听快捷键(Cmd+K / Cmd+, / Esc)
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
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

  // P2-11 修复(2026-06-15): workspaceLayout 变化 → 写盘(300ms debounce + beforeunload flush)
  useEffect(() => {
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false
      return
    }
    const layout = workspaceLayout
    if (projectFlushTimerRef.current) clearTimeout(projectFlushTimerRef.current)
    if (globalFlushTimerRef.current) clearTimeout(globalFlushTimerRef.current)
    if (projectPath) {
      projectFlushTimerRef.current = setTimeout(() => {
        void persistence.persistProject(projectPath, layout)
      }, PERSIST_DEBOUNCE_MS)
    }
    globalFlushTimerRef.current = setTimeout(() => {
      void persistence.persistGlobal(layout)
    }, PERSIST_DEBOUNCE_MS)

    return () => {
      if (projectFlushTimerRef.current) clearTimeout(projectFlushTimerRef.current)
      if (globalFlushTimerRef.current) clearTimeout(globalFlushTimerRef.current)
    }
  }, [workspaceLayout, projectPath, persistence])

  // beforeunload 强制 flush 最后一笔
  useEffect(() => {
    const flush = (): void => {
      if (projectFlushTimerRef.current) clearTimeout(projectFlushTimerRef.current)
      if (globalFlushTimerRef.current) clearTimeout(globalFlushTimerRef.current)
      const layout = useUiStore.getState().workspaceLayout
      if (projectPath) void persistence.persistProject(projectPath, layout)
      void persistence.persistGlobal(layout)
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [projectPath, persistence])

  if (preferencesOpen) {
    return <PreferencesDialog />
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-bg text-text">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden">
        {projectPath ? (
          <>
            <ActivityBar />
            <SidePanel />
            <DockviewCenterTabs />
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
