/**
 * App.tsx — Galide 顶层布局(PyCharm 2026 组件岛风格)
 *
 * 设计:
 *   - 3 层顶栏: Menu Bar(应用菜单) + Toolbar(项目操作) + Project Tabs(已开文件)
 *   - 主区: LeftToolWindow | CenterSplit | (可选 AI 右侧 dock) | (可选 AI 底部 dock)
 *   - 6 区块 StatusBar:git / 错误 / 消息 / 光标 / 缩放 / AI 状态
 *
 * P1 重构(2026-06-17):
 *   - 删 3 个 useEffect(hydrate / persist / beforeunload flush)
 *   - 删 workspace_layout 序列化(改由 zustand 标量 + React 自管)
 *   - 删 useRef × 3(治本:之前用 ref 绕 exhaustive-deps 是历史遗留)
 *   - 简化 useUiStore 字段(workspaceLayout → 5 个标量)
 *
 * 状态语义:
 *   - leftPanelOpen / leftPanel:左侧 Tool Window(PyCharm Project 风格)
 *   - aiPanelOpen / aiDockedLocation:右侧 / 底部 / 浮动的 AI Tool Window
 *   - workspacePreset:writing / flow / review 单值 enum
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
import { useKeyboardShortcuts } from '../lib/hooks/use-keyboard-shortcuts'
import { useMosaicPersistence } from '../lib/hooks/use-mosaic-persistence'
import { FloatingPanelHost, isFloatingWindow } from './FloatingPanelHost'
import { sanitizeTree, getAllLeafIds } from '../components/workspace/mosaic/MosaicRoot'
import type { WorkspaceMosaicNode } from '../lib/store'

const insertPanelIntoTree = (
  tree: WorkspaceMosaicNode,
  panelId: 'script-editor' | 'flow-view' | 'preview-canvas'
): WorkspaceMosaicNode => {
  if (typeof tree === 'string') {
    return tree === panelId
      ? tree
      : ({ direction: 'row' as const, first: tree, second: panelId } as WorkspaceMosaicNode)
  }
  return { direction: 'row' as const, first: tree, second: panelId } as WorkspaceMosaicNode
}

export const App = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const preferencesOpen = useUiStore((s) => s.preferencesOpen)
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen)
  const exportDialogOpen = useUiStore((s) => s.exportDialogOpen)
  const commitDialogOpen = useUiStore((s) => s.commitDialogOpen)

  // 主题同步(订阅 store.theme,effect 内 toggle .dark class)
  useAppearanceEffect()

  // 全局快捷键(Cmd+K / Cmd+, / Cmd+L / Cmd+1 / Cmd+W)
  useKeyboardShortcuts()

  // PR2: mosaic 树持久化(启动期 read + 变化时 debounced write)
  useMosaicPersistence()

  // PR2/PR3-D: 浮出 panel 窗口关闭 → 同步 store(中区 panel 插回 mosaic 树)
  useEffect(() => {
    const off = window.galide.workspace.onPanelClosed(({ panelId }) => {
      useUiStore.getState().removeFloatingPanel(panelId)
      // 中区 panel 关闭时,把该 panel 插回 mosaic 树
      if (panelId !== 'left-tool-window' && panelId !== 'ai-tool-window') {
        const cur = useUiStore.getState().mosaicTree
        if (cur) {
          // 检查 panel 是否已在树里(避免重复)
          const leaves = getAllLeafIds(cur)
          if (!leaves.includes(panelId)) {
            const next = insertPanelIntoTree(cur, panelId)
            useUiStore.getState().setMosaicTree(sanitizeTree(next))
          }
        }
      }
    })
    return off
  }, [])

  // 浮出模式:独立 BrowserWindow 加载 ?floating=1&panelId=xxx,只渲染对应 panel
  if (isFloatingWindow()) {
    return <FloatingPanelHost />
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-bg text-text overflow-hidden">
      <MenuBar />
      <Toolbar />
      <ProjectTabs />
      <main className="flex-1 min-h-0 flex overflow-hidden bg-canvas p-2 gap-2">
        <ActivityBar />
        {projectPath ? (
          <CenterSplit />
        ) : (
          <WelcomeScreen />
        )}
      </main>
      <StatusBar />
      {commandPaletteOpen && <CommandPalette />}
      {preferencesOpen && <PreferencesDialog />}
      {projectPath && exportDialogOpen && <ExportDialog />}
      {projectPath && commitDialogOpen && <CommitDialog />}
    </div>
  )
}
