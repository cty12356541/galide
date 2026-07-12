/**
 * project-coordinator — 跨 store 的 open/close project 协调 hook
 *
 * 打开或关闭项目时需要同步 script / project / workspace / ui 多个 store,
 * 这些动作不应散落在组件里,集中在这里处理。
 */
import { useCallback } from 'react'
import type { ProjectManifest } from '../../../shared/types'
import { scriptStore } from './script-store'
import { projectStore } from './project-store'
import { workspaceStore } from './workspace-store'
import { uiStore } from './ui-store'

const resetScriptStateOnOpen = (): void => {
  scriptStore.setState({
    openFiles: [],
    fileCache: {},
    scriptPast: [],
    scriptFuture: []
  })
}

const resetScriptStateOnClose = (): void => {
  scriptStore.setState({
    activeScriptFile: null,
    scriptSource: '',
    scriptAst: null,
    scriptDiagnostics: [],
    scriptDirty: false,
    openFiles: [],
    fileCache: {},
    scriptPast: [],
    scriptFuture: [],
    selectedSceneId: null
  })
}

export const openProject = (projectPath: string, manifest: ProjectManifest): void => {
  projectStore.setState({
    projectPath,
    manifest,
    projectName: manifest.name,
    projectMergedAst: null,
    projectParseError: null,
    selectedCharacterId: null,
    characterEditorTargetId: null
  })
  resetScriptStateOnOpen()
  const workspaceState = workspaceStore.getState()
  workspaceState.applyWorkspacePreset(workspaceState.workspacePreset)
}

export const closeProject = (): void => {
  projectStore.setState({
    projectPath: null,
    manifest: null,
    projectName: null,
    projectMergedAst: null,
    projectParseError: null
  })
  resetScriptStateOnClose()
  uiStore.setState({ selectedNode: null })
}

export const useOpenProject = (): ((projectPath: string, manifest: ProjectManifest) => void) =>
  useCallback((projectPath, manifest) => openProject(projectPath, manifest), [])

export const openCharacterFromOutline = (id: string): void => {
  projectStore.setState({
    selectedCharacterId: id,
    characterEditorTargetId: id
  })
  const workspace = workspaceStore.getState()
  workspace.setActiveSubIsland('character', 'profiles')
  workspace.showToolWindow('character')
}

export const useCloseProject = (): (() => void) => useCallback(() => closeProject(), [])
