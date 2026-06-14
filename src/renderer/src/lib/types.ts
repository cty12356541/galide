import type { ProjectManifest, CharacterCard } from '../../../shared/types'
import type { SceneNode, DialogueNode, MarkerNode } from '../../../shared/dsl/types'

export type EditorLayout = {
  sidebar: number
  editor: number
  flow: number
  preview: number
}

export type RecentProject = {
  path: string
  name: string
  lastOpened: string
}

export type ErrorEntry = {
  id: string
  code: string
  message: string
  source: string
  timestamp: number
}

export type SelectedNode = SceneNode | DialogueNode | MarkerNode | null

export type ProjectSnapshot = {
  projectPath: string
  manifest: ProjectManifest
}

export type CharacterWithMeta = CharacterCard & {
  isMain?: boolean
}
