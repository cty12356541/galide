/**
 * useKeyboardShortcuts — 全局快捷键 hook(P5a/P5b 重构)
 *
 * 设计:
 *   - App 顶层 mount 一次,监听 window keydown(bubble 阶段)
 *   - 录制快捷键时 early-return(use-shortcut-recorder 在 capture 阶段独占)
 *   - ESC 单源:任一 modal 打开 → dismissTopModal;浮出窗 → window.close()
 *   - modal guard:任一 modal 打开时,除 ⌘K(关命令面板)与 ESC 外,其余快捷键 early-return,防叠弹
 *   - 浮出窗 guard:独立 BrowserWindow 内禁用项目级/布局切换/开对话框键,
 *     仅放行编辑器内键(CodeMirror 自管,本 hook 不拦截)
 *   - ⌘N=新建脚本 / ⌘⇧N=新建项目 / ⌘1 切左槽 / ⌘2..⌘5 切工具窗 / ⌘E 导出 / ⌘⇧C 提交
 *     ⌘K 命令面板 / ⌘, 偏好(⌘L 不再占 AI)
 */
import { useEffect, useRef } from 'react'
import { useUiStore } from '../store'
import { isFloatingWindow } from '../../app/FloatingPanelHost'
import { useNewScriptFile } from './use-new-script-file'
import { useProject } from '../ipc/use-project'
import type { ToolWindowId } from '../../components/workspace/mosaic/panel-registry'

export const useKeyboardShortcuts = (): void => {
  const newScriptFile = useNewScriptFile()
  const openProject = useProject().open
  // newScriptFile 不是稳定引用(依赖 projectPath/script),用 ref 持有最新值,
  // 这样 keydown handler 永不闭包过期且无需重订阅。
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

      // ⌘K:命令面板开则关,否则(无其他 modal 时)开
      if (meta && e.key === 'k') {
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

     // ⌘P:Go to File(命令面板文件模式);已有 modal 占用时不抢
     if (meta && e.key.toLowerCase() === 'p') {
       if (anyModalOpen && !s.commandPaletteOpen) return
       e.preventDefault()
       s.openGoToFile()
       return
     }

     // modal guard:其余快捷键在 modal 打开时一律不触发,防叠弹
     if (anyModalOpen) return

     // ⌘Z/⌘⇧Z(⌘Y):卡片编辑器走 store 撤销栈;CodeMirror 内由其自身 history 自管,跳过。
     // 放在 modal guard 之后、浮出窗 guard 之前 → 浮出窗仍可撤销(编辑器内键)。
     const keyLower = e.key.toLowerCase()
     const inCodeMirror = !!document.activeElement?.closest?.('.cm-editor')
     if (meta && !e.shiftKey && keyLower === 'z' && !inCodeMirror) {
       if (s.scriptPast.length > 0) {
         e.preventDefault()
         s.undo()
       }
       return
     }
     if (
       meta &&
       !inCodeMirror &&
       ((e.shiftKey && keyLower === 'z') || keyLower === 'y')
     ) {
       if (s.scriptFuture.length > 0) {
         e.preventDefault()
         s.redo()
       }
       return
     }

     // 浮出窗 guard:禁用项目级/布局切换/开对话框键(编辑器内键由 CodeMirror 自管)
     if (isFloatingWindow()) return

      // shift 组合优先判断(避免被无 shift 分支误吞)
      if (meta && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        s.openNewProjectDialog()
        return
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === 'c' && s.projectPath) {
        e.preventDefault()
        s.openCommitDialog()
        return
      }

     if (meta && e.key === 'n') {
       e.preventDefault()
       void newScriptFileRef.current()
       return
     }
     if (meta && e.key.toLowerCase() === 'o') {
       e.preventDefault()
       void openProjectRef.current()
       return
     }
     if (meta && e.key === ',') {
       e.preventDefault()
       s.openPreferences()
        return
      }
      if (meta && e.key === '1') {
        e.preventDefault()
        s.toggleLeftPanel()
        return
      }
      // ⌘2..⌘5:切换对应工具窗
      const twMap: Record<string, ToolWindowId> = {
        '2': 'git',
        '3': 'outline',
        '4': 'character',
        '5': 'ai'
      }
      if (meta && twMap[e.key]) {
        e.preventDefault()
        s.showToolWindow(twMap[e.key])
        return
      }
      if (meta && e.key === 'e' && s.projectPath) {
        e.preventDefault()
        s.openExportDialog()
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
