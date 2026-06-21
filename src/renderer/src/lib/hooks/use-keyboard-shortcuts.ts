/**
 * useKeyboardShortcuts — 全局快捷键 hook(命令注册表驱动)
 *
 * 设计:
 *   - App 顶层 mount 一次,监听 window keydown(bubble 阶段)
 *   - 快捷键来自命令注册表(COMMANDS)+ 用户覆盖(偏好面板录制存盘),
 *     "用户覆盖 ?? 默认" 经 effectiveShortcut 解析后灌入 store.resolvedShortcuts
 *   - 录制快捷键时 early-return(use-shortcut-recorder 在 capture 阶段独占)
 *   - ESC 单源:任一 modal 打开 → dismissTopModal;浮出窗 → window.close()
 *   - modal guard:任一 modal 打开时,除命令面板切换与 ESC 外,其余快捷键 early-return,防叠弹
 *   - 浮出窗 guard:禁用项目级/布局切换/开对话框键,仅放行编辑器内键 + 撤销/重做
 *
 * 命令→动作的映射在 dispatch 中收口(单一 switch),新增命令只改 registry + switch。
 */
import { useEffect, useRef } from 'react'
import { useUiStore } from '../store'
import { isFloatingWindow } from '../../app/FloatingPanelHost'
import { useNewScriptFile } from './use-new-script-file'
import { useProject } from '../ipc/use-project'
import { useShortcuts } from '../ipc/use-preferences'
import {
  effectiveShortcut,
  acceleratorMatches,
  COMMANDS,
  type CommandId
} from '../command-registry'
import type { ToolWindowId } from '../../components/workspace/mosaic/panel-registry'

const TOOL_WINDOW_COMMANDS: Partial<Record<CommandId, ToolWindowId>> = {
  showGit: 'git',
  showOutline: 'outline',
  showCharacter: 'character',
  showAi: 'ai'
}

/**
 * useResolvedShortcutsSync — 订阅用户快捷键偏好 → 解析有效 accelerator 灌入 store。
 * 单独拆出:键盘 hook 仅同步读 store.resolvedShortcuts,不耦合 react-query,便于测试。
 * 由 App 挂载一次。store 默认值已是 DEFAULT_SHORTCUTS,故启动即可用,偏好加载后覆盖。
 */
export const useResolvedShortcutsSync = (): void => {
  const shortcutsQuery = useShortcuts()
  useEffect(() => {
    const resolved: Record<string, string> = {}
    for (const cmd of COMMANDS) {
      const acc = effectiveShortcut(cmd.id, shortcutsQuery.data)
      if (acc) resolved[cmd.id] = acc
    }
    useUiStore.getState().setResolvedShortcuts(resolved)
  }, [shortcutsQuery.data])
}

export const useKeyboardShortcuts = (): void => {
  const newScriptFile = useNewScriptFile()
  const openProject = useProject().open
  // 非稳定引用(依赖 projectPath/script)用 ref 持有最新值,handler 永不闭包过期。
  const newScriptFileRef = useRef(newScriptFile)
  newScriptFileRef.current = newScriptFile
  const openProjectRef = useRef(openProject)
  openProjectRef.current = openProject

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // 始终读最新 store 状态,避免闭包过期导致 modal guard / dismiss 失效
      const s = useUiStore.getState()
      if (s.shortcutRecording) return
      const meta = e.metaKey || e.ctrlKey
      const anyModalOpen =
        s.commandPaletteOpen ||
        s.preferencesOpen ||
        s.exportDialogOpen ||
        s.commitDialogOpen ||
        s.newProjectDialogOpen

      // ESC 单源:关最上层 modal;浮出窗关窗
      if (e.key === 'Escape') {
        if (anyModalOpen) {
          e.preventDefault()
          s.dismissTopModal()
        } else if (isFloatingWindow()) {
          e.preventDefault()
          window.close()
        }
        return
      }

      // 命令面板与跳转文件:modal 内仅"命令面板已开则关",其余 modal 占用时让出
      if (acceleratorMatches(s.resolvedShortcuts.commandPalette ?? '', e)) {
        if (s.commandPaletteOpen) {
          e.preventDefault()
          s.toggleCommandPalette(false)
          return
        }
        if (anyModalOpen) return
        e.preventDefault()
        s.toggleCommandPalette()
        return
      }
      if (acceleratorMatches(s.resolvedShortcuts.goToFile ?? '', e)) {
        if (anyModalOpen && !s.commandPaletteOpen) return
        e.preventDefault()
        s.openGoToFile()
        return
      }

      // modal guard:其余快捷键在 modal 打开时一律不触发,防叠弹
      if (anyModalOpen) return

      // F5 运行预览:切评审预设 + 展开预览(无修饰键,需在 meta guard 前)
      if (acceleratorMatches(s.resolvedShortcuts.togglePreview ?? '', e)) {
        if (!s.projectPath) return
        e.preventDefault()
        s.applyWorkspacePreset('review')
        s.setPreviewOpen(true)
        return
      }

      // ⌘S 立即存盘(卡片面 / 非 CodeMirror 焦点)
      const inCodeMirror = !!document.activeElement?.closest?.('.cm-editor')
      const useSourceEditor = s.editorSurface === 'source'
      if (meta && e.key.toLowerCase() === 's' && !inCodeMirror) {
        e.preventDefault()
        void s.flushPendingScriptSave()
        return
      }

      // ⌘F 查找:源码 tab 或内嵌编辑器
      if (meta && e.key.toLowerCase() === 'f') {
        if (useSourceEditor || inCodeMirror) {
          if (!inCodeMirror && useSourceEditor) {
            e.preventDefault()
            s.setEditorSurface('source')
            requestAnimationFrame(() => {
              const cm = document.querySelector<HTMLElement>(
                '[data-testid="script-editor-cm-host"] .cm-editor'
              )
              cm?.focus()
              const target = cm?.querySelector<HTMLElement>('.cm-content') ?? cm
              target?.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true })
              )
            })
          }
          return
        }
      }

      // 撤销/重做:源码 tab → CodeMirror history;卡片 → store 栈
      const routeToCodeMirror = useSourceEditor || inCodeMirror
      if (acceleratorMatches(s.resolvedShortcuts.undo ?? '', e)) {
        if (routeToCodeMirror) return
        if (s.scriptPast.length > 0) {
          e.preventDefault()
          s.undo()
        }
        return
      }
      if (acceleratorMatches(s.resolvedShortcuts.redo ?? '', e)) {
        if (routeToCodeMirror) return
        if (s.scriptFuture.length > 0) {
          e.preventDefault()
          s.redo()
        }
        return
      }

      // 浮出窗 guard:禁用项目级/布局切换/开对话框键(编辑器内键由 CodeMirror 自管)
      if (isFloatingWindow()) return

      // 其余命令:逐个匹配已解析 accelerator,命中则 dispatch
      // 仅对需要修饰键的命令参与(无修饰键的纯字符不在此 hook 处理)
      if (!meta) return

      const dispatch = (id: CommandId): boolean => {
        switch (id) {
          case 'newProject':
            e.preventDefault()
            s.openNewProjectDialog()
            return true
          case 'commit':
            if (!s.projectPath) return false
            e.preventDefault()
            s.openCommitDialog()
            return true
          case 'newScriptFile':
            e.preventDefault()
            void newScriptFileRef.current()
            return true
          case 'openProject':
            e.preventDefault()
            void openProjectRef.current()
            return true
          case 'openPreferences':
            e.preventDefault()
            s.openPreferences()
            return true
          case 'toggleLeftPanel':
            e.preventDefault()
            s.toggleLeftPanel()
            return true
          case 'showGit':
          case 'showOutline':
          case 'showCharacter':
          case 'showAi': {
            const tw = TOOL_WINDOW_COMMANDS[id]
            if (!tw) return false
            e.preventDefault()
            s.showToolWindow(tw)
            return true
          }
          case 'export':
            if (!s.projectPath) return false
            e.preventDefault()
            s.openExportDialog()
            return true
          default:
            return false
        }
      }

      for (const cmd of COMMANDS) {
        const acc = s.resolvedShortcuts[cmd.id]
        if (!acc) continue
        // 已在上面单独处理的命令跳过,避免重复
        if (
          cmd.id === 'commandPalette' ||
          cmd.id === 'goToFile' ||
          cmd.id === 'undo' ||
          cmd.id === 'redo'
        ) {
          continue
        }
        if (acceleratorMatches(acc, e)) {
          if (dispatch(cmd.id)) return
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
