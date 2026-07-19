/**
 * useCommandDispatcher — 命令处理器注册 + 统一投递入口(命令基座)
 *
 * 设计:
 *   - CommandId → 动作的映射集中在此 hook:store/IPC 依赖留在 hooks 层,
 *     command-registry 保持纯数据,避免 store → registry 循环依赖
 *   - handler 注册进 command-dispatcher 模块的全局表;键盘 hook / agent IPC /
 *     (后续)MenuBar / CommandPalette / Toolbar 全部经 dispatchCommand 走同一条执行路径
 *   - handlers 用 Record<CommandId, CommandHandler> 全键约束:COMMANDS 新增命令若漏映射,编译即报错
 *   - 键盘 hook 保留的旁路(ESC / ⌘S / ⌘F / 撤销重做的 CodeMirror 路由)在 use-keyboard-shortcuts 原地注释 owner
 */
import { useCallback, useEffect } from 'react'
import {
  dispatchCommand as dispatchRegistered,
  registerCommandHandlers,
  type CommandHandler
} from '../command-dispatcher.js'
import type { CommandId } from '../command-registry.js'
import { useUiStore } from '../store'
import { useNewScriptFile } from './use-new-script-file'
import { useProject } from '../ipc/use-project'
import { useCloseProject } from '../project-coordinator.js'
import { usePanelFloat } from './use-panel-float'
import { confirmDialog } from '../promise-dialog-store'

/** 切到源码编辑器并触发 CodeMirror 内置搜索面板(与 MenuBar「查找 ⌘F」同语义) */
const focusEditorAndSearch = (): void => {
  const s = useUiStore.getState()
  if (s.editorSurface !== 'source') {
    s.setEditorSurface('source')
  }
  requestAnimationFrame(() => {
    const cm = document.querySelector<HTMLElement>(
      '[data-testid="script-editor-cm-host"] .cm-editor'
    )
    if (!cm) return
    cm.focus()
    const target = cm.querySelector<HTMLElement>('.cm-content') ?? cm
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true }))
  })
}

export type DispatchCommand = (id: CommandId) => Promise<{ ok: boolean; error?: string }>

export const useCommandDispatcher = (): { dispatchCommand: DispatchCommand } => {
  const newScriptFile = useNewScriptFile()
  const { open: openProject } = useProject()
  const closeProject = useCloseProject()
  const float = usePanelFloat()

  useEffect(() => {
    const handlers: Record<CommandId, CommandHandler> = {
      commandPalette: () => useUiStore.getState().toggleCommandPalette(),
      goToFile: () => useUiStore.getState().openGoToFile(),
      openPreferences: () => useUiStore.getState().openPreferences(),
      newScriptFile: () => void newScriptFile(),
      newProject: () => useUiStore.getState().openNewProjectDialog(),
      openProject: () => void openProject(),
      // 关闭项目统一确认(原原生 confirm,现走 Promise 对话框;确认后才执行)
      closeProject: () => {
        void confirmDialog({
          title: '关闭项目',
          description: '关闭当前项目?未保存改动请先保存。'
        }).then((ok) => {
          if (ok) closeProject()
        })
      },
      commit: () => useUiStore.getState().openCommitDialog(),
      export: () => useUiStore.getState().openExportDialog(),
      toggleLeftPanel: () => useUiStore.getState().toggleLeftPanel(),
      showGit: () => useUiStore.getState().showToolWindow('git'),
      showOutline: () => useUiStore.getState().showToolWindow('outline'),
      showCharacter: () => useUiStore.getState().showToolWindow('character'),
      showAi: () => useUiStore.getState().showToolWindow('ai'),
      toggleAi: () => useUiStore.getState().toggleAiPanel(),
      togglePreview: () => {
        useUiStore.getState().applyWorkspacePreset('review')
        useUiStore.getState().setPreviewOpen(true)
      },
      undo: () => useUiStore.getState().undo(),
      redo: () => useUiStore.getState().redo(),
      find: () => focusEditorAndSearch(),
      saveScript: () => void useUiStore.getState().flushPendingScriptSave(),
      toggleTheme: () => {
        const s = useUiStore.getState()
        s.setTheme(s.theme === 'dark' ? 'light' : 'dark')
      },
      presetWriting: () => useUiStore.getState().applyWorkspacePreset('writing'),
      presetFlow: () => useUiStore.getState().applyWorkspacePreset('flow'),
      presetReview: () => useUiStore.getState().applyWorkspacePreset('review'),
      aiDockLeft: () => useUiStore.getState().setAiDockedLocation('left'),
      aiDockRight: () => useUiStore.getState().setAiDockedLocation('right'),
      aiDockBottom: () => useUiStore.getState().setAiDockedLocation('bottom'),
      floatAi: () => float('ai')
    }
    registerCommandHandlers(handlers)
  }, [newScriptFile, openProject, closeProject, float])

  const dispatchCommand = useCallback<DispatchCommand>((id) => dispatchRegistered(id), [])
  return { dispatchCommand }
}
