/**
 * use-command-handlers — 为 agent dispatch 注册 CommandId → 动作映射
 */
import { useEffect } from 'react'
import { registerCommandHandlers } from '../command-dispatcher.js'
import { useUiStore } from '../store'
import { useNewScriptFile } from '../hooks/use-new-script-file'
import { useProject } from './use-project'

export const useCommandHandlers = (): void => {
  const newScriptFile = useNewScriptFile()
  const { open: openProject } = useProject()

  useEffect(() => {
    registerCommandHandlers({
      commandPalette: () => useUiStore.getState().toggleCommandPalette(),
      goToFile: () => useUiStore.getState().openGoToFile(),
      openPreferences: () => useUiStore.getState().openPreferences(),
      newScriptFile: () => void newScriptFile(),
      newProject: () => useUiStore.getState().openNewProjectDialog(),
      openProject: () => void openProject(),
      closeProject: () => void useUiStore.getState().closeProject(),
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
      redo: () => useUiStore.getState().redo()
    })
  }, [newScriptFile, openProject])
}
