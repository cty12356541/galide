/**
 * project-store — 项目状态 Zustand store
 */
import { createStore } from 'zustand'
import { useStore } from 'zustand'
import type { ProjectManifest } from '../../../shared/types'
import type { ScriptNode } from '../../../shared/dsl/types'

export type ProjectSliceState = {
  projectPath: string | null
  projectName: string | null
  manifest: ProjectManifest | null
  projectMergedAst: ScriptNode | null
  projectParseError: string | null
  selectedCharacterId: string | null
  characterEditorTargetId: string | null
}

export type ProjectSliceActions = {
  setProject: (projectPath: string, manifest: ProjectManifest) => void
  setSelectedCharacterId: (id: string | null) => void
  openCharacterFromOutline: (id: string) => void
  clearCharacterEditorTarget: () => void
  setProjectMergedAst: (ast: ScriptNode | null, error?: string | null) => void
  closeProject: () => void
}

export type ProjectState = ProjectSliceState & ProjectSliceActions

const projectInitialState: ProjectSliceState = {
  projectPath: null,
  projectName: null,
  manifest: null,
  projectMergedAst: null,
  projectParseError: null,
  selectedCharacterId: null,
  characterEditorTargetId: null
}

export const projectStore = createStore<ProjectState>((set) => ({
  ...projectInitialState,

  setProject: (projectPath, manifest) => {
    set({
      projectPath,
      manifest,
      projectName: manifest.name,
      projectMergedAst: null,
      projectParseError: null,
      selectedCharacterId: null,
      characterEditorTargetId: null
    })
  },

  setSelectedCharacterId: (id) => set({ selectedCharacterId: id }),

  openCharacterFromOutline: (id) =>
    set({
      selectedCharacterId: id,
      characterEditorTargetId: id
    }),

  clearCharacterEditorTarget: () => set({ characterEditorTargetId: null }),

  setProjectMergedAst: (ast, error = null) =>
    set({ projectMergedAst: ast, projectParseError: error }),

  closeProject: () =>
    set({
      projectPath: null,
      manifest: null,
      projectName: null,
      projectMergedAst: null,
      projectParseError: null
    })
}))

export const useProjectStore: {
  (): ProjectState
  <U>(selector: (state: ProjectState) => U): U
  getState: typeof projectStore.getState
  setState: typeof projectStore.setState
  subscribe: typeof projectStore.subscribe
} = Object.assign(
  <U>(selector?: (state: ProjectState) => U) => useStore(projectStore, selector!) as U,
  {
    getState: projectStore.getState.bind(projectStore),
    setState: projectStore.setState.bind(projectStore),
    subscribe: projectStore.subscribe.bind(projectStore)
  }
)
