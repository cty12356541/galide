/**
 * App.tsx — Galide 顶层布局(功能即岛 v2:主岛/子岛二级群岛)
 *
 * 设计:
 *   - 3 层顶栏: Menu Bar + Toolbar + Project Tabs
 *   - 主区: ActivityBar | CenterSplit(左槽/编辑器大陆/右槽/底部槽)
 *   - 6 区块 StatusBar
 *
 * 功能即岛 v2(2026-06-19):
 *   - 浮出窗口关闭 → 三分支 restore(编辑器大陆插回 mosaic / 主岛回 dockSide 槽 / 子岛回 tab)
 *   - 状态语义改 dockSide + visiblePerSide + activeSubIsland(见 store)
 */
import { useEffect } from 'react'
import { useUiStore } from '../lib/store'
import { useAppearanceEffect } from '../lib/ipc/use-appearance-effect'
import { MenuBar } from './MenuBar'
import { Toolbar } from './Toolbar'
import { ProjectTabs } from './ProjectTabs'
import { CenterSplit } from '../components/workspace/CenterSplit'
import { ActivityBar } from '../components/workspace/ActivityBar'
import { StatusBar } from './StatusBar'
import { WelcomeScreen } from './WelcomeScreen'
import { CommandPalette } from '../features/command-palette/CommandPalette'
import { PreferencesDialog } from '../features/preferences/PreferencesDialog'
import { ExportDialog } from '../features/export/ExportDialog'
import { CommitDialog } from '../features/git/CommitDialog'
import { NewProjectDialog } from '../features/project/NewProjectDialog'
import { useKeyboardShortcuts } from '../lib/hooks/use-keyboard-shortcuts'
import { useScriptSync } from '../lib/hooks/use-script-sync'
import { useWorkspacePersistence } from '../lib/hooks/use-workspace-persistence'
import { FloatingPanelHost, isFloatingWindow } from './FloatingPanelHost'
import {
  isToolWindowId,
  isSubIslandId,
  parentOfSubIsland
} from '../components/workspace/mosaic/panel-registry'

export const App = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const preferencesOpen = useUiStore((s) => s.preferencesOpen)
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen)
  const exportDialogOpen = useUiStore((s) => s.exportDialogOpen)
  const commitDialogOpen = useUiStore((s) => s.commitDialogOpen)
  const newProjectDialogOpen = useUiStore((s) => s.newProjectDialogOpen)

  useAppearanceEffect()
  useKeyboardShortcuts()
  useScriptSync()
  useWorkspacePersistence()

  // 浮出窗口关闭 → 同步 store + restore(主岛回 dockSide 槽 / 子岛回 tab)
  useEffect(() => {
    const off = window.galide.workspace.onPanelClosed(({ panelId }) => {
      useUiStore.getState().removeFloatingPanel(panelId)
      if (isToolWindowId(panelId)) {
        useUiStore.getState().showToolWindow(panelId)
      } else if (isSubIslandId(panelId)) {
        const parent = parentOfSubIsland(panelId)
        if (parent) {
          useUiStore.getState().setActiveSubIsland(parent, panelId)
          useUiStore.getState().showToolWindow(parent)
        }
      }
    })
    return off
  }, [])

  if (isFloatingWindow()) {
    return <FloatingPanelHost />
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-bg text-text overflow-hidden">
      <MenuBar />
      <Toolbar />
      <ProjectTabs />
      <main className="flex-1 min-h-0 flex overflow-hidden bg-canvas p-3 gap-3">
        <ActivityBar />
        {projectPath ? <CenterSplit /> : <WelcomeScreen />}
      </main>
      <StatusBar />
      {commandPaletteOpen && <CommandPalette />}
      {preferencesOpen && <PreferencesDialog />}
      {projectPath && exportDialogOpen && <ExportDialog />}
      {projectPath && commitDialogOpen && <CommitDialog />}
      {newProjectDialogOpen && <NewProjectDialog />}
    </div>
  )
}
