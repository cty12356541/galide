/**
 * Galide renderer 端 Zustand stores
 *
 * 功能即岛 v2(2026-06-19): 主岛/子岛二级群岛 + dock 可移动
 *
 * 设计原则:
 *   - 4 个独立 store: script / project / workspace / ui
 *   - useUiStore 为兼容 facade,保留旧的合并 state shape 与 selector 写法
 *   - 跨 store 协调通过 project-coordinator 完成
 */
import { useMemo } from 'react'
import { useStore } from 'zustand'
import {
  scriptStore,
  useScriptStore,
  type ScriptSliceState,
  type ScriptSliceActions
} from './script-store'
import {
  workspaceStore,
  useWorkspaceStore
} from './workspace-store'
import type {
  WorkspaceSliceState,
  WorkspaceSliceActions
} from './workspace-store.types'
import {
  projectStore,
  useProjectStore,
  type ProjectSliceState,
  type ProjectSliceActions
} from './project-store'
import {
  uiStore,
  useUiOnlyStore,
  type UiOnlyState,
  type UiOnlyActions
} from './ui-store'
import {
  openProject,
  closeProject,
  openCharacterFromOutline
} from './project-coordinator'
import type {
  WorkspacePresetId,
  EditorCoreLayout,
  LayoutsByPreset
} from './workspace-presets'

export { useErrorStore } from './error-store'
export {
  useScriptStore,
  useProjectStore,
  useWorkspaceStore,
  useUiOnlyStore,
  scriptStore,
  projectStore,
  workspaceStore,
  uiStore
}
export type { WorkspacePresetId, EditorCoreLayout, LayoutsByPreset }
export type { ScriptSliceState, ScriptSliceActions } from './script-store'
export type { Theme, UiOnlyState, UiOnlyActions } from './ui-store'
export { openProject, closeProject, openCharacterFromOutline } from './project-coordinator'

export type UiState = ScriptSliceState &
  ScriptSliceActions &
  ProjectSliceState &
  ProjectSliceActions &
  WorkspaceSliceState &
  WorkspaceSliceActions &
  UiOnlyState &
  UiOnlyActions

// ----------------------------------------------------------------------------
// Merged facade
// ----------------------------------------------------------------------------

const getMergedState = (): UiState => {
  const script = scriptStore.getState()
  const project = projectStore.getState()
  const workspace = workspaceStore.getState()
  const ui = uiStore.getState()
  return {
    ...script,
    ...project,
    ...workspace,
    ...ui,
    setProject: openProject,
    closeProject,
    openCharacterFromOutline
  } as UiState
}

const routePartialToStores = (
  partial: Partial<UiState>
): {
  script: Partial<ScriptSliceState & ScriptSliceActions>
  project: Partial<ProjectSliceState & ProjectSliceActions>
  workspace: Partial<WorkspaceSliceState & WorkspaceSliceActions>
  ui: Partial<UiOnlyState & UiOnlyActions>
} => {
  const script: Partial<ScriptSliceState & ScriptSliceActions> = {}
  const project: Partial<ProjectSliceState & ProjectSliceActions> = {}
  const workspace: Partial<WorkspaceSliceState & WorkspaceSliceActions> = {}
  const ui: Partial<UiOnlyState & UiOnlyActions> = {}

  const scriptState = scriptStore.getState()
  const projectState = projectStore.getState()
  const workspaceState = workspaceStore.getState()
  const uiState = uiStore.getState()

  for (const [key, value] of Object.entries(partial)) {
    if (key in scriptState) {
      ;(script as Record<string, unknown>)[key] = value
    } else if (key in projectState) {
      ;(project as Record<string, unknown>)[key] = value
    } else if (key in workspaceState) {
      ;(workspace as Record<string, unknown>)[key] = value
    } else if (key in uiState) {
      ;(ui as Record<string, unknown>)[key] = value
    }
  }

  return { script, project, workspace, ui }
}

const routedSetState = (
  partial: Partial<UiState> | ((state: UiState) => Partial<UiState>)
): void => {
  const resolved = typeof partial === 'function' ? partial(getMergedState()) : partial
  const { script, project, workspace, ui } = routePartialToStores(resolved)
  if (Object.keys(script).length > 0) scriptStore.setState(script)
  if (Object.keys(project).length > 0) projectStore.setState(project)
  if (Object.keys(workspace).length > 0) workspaceStore.setState(workspace)
  if (Object.keys(ui).length > 0) uiStore.setState(ui)
}

const mergedSubscribe = (
  listener: (state: UiState, prevState: UiState) => void
): (() => void) => {
  let prev = getMergedState()
  const notify = (): void => {
    const next = getMergedState()
    listener(next, prev)
    prev = next
  }
  const unsubScript = scriptStore.subscribe(notify)
  const unsubProject = projectStore.subscribe(notify)
  const unsubWorkspace = workspaceStore.subscribe(notify)
  const unsubUi = uiStore.subscribe(notify)
  return () => {
    unsubScript()
    unsubProject()
    unsubWorkspace()
    unsubUi()
  }
}

function useUiStoreImpl<U>(selector?: (state: UiState) => U): UiState | U {
  const script = useStore(scriptStore)
  const project = useStore(projectStore)
  const workspace = useStore(workspaceStore)
  const ui = useStore(uiStore)
  const merged = useMemo(() => {
    const state = { ...script, ...project, ...workspace, ...ui }
    state.setProject = openProject
    state.closeProject = closeProject
    state.openCharacterFromOutline = openCharacterFromOutline
    return state as UiState
  }, [script, project, workspace, ui])
  return selector ? selector(merged) : merged
}

export const useUiStore: {
  (): UiState
  <U>(selector: (state: UiState) => U): U
  getState: typeof getMergedState
  setState: typeof routedSetState
  subscribe: typeof mergedSubscribe
} = Object.assign(useUiStoreImpl, {
  getState: getMergedState,
  setState: routedSetState,
  subscribe: mergedSubscribe
})
