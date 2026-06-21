import type { AstNode, ChoiceNode, DialogueNode, SceneNode } from '../../../../shared/dsl/types'

export type PreviewDialogue = { type: 'dialogue'; character: string; text: string }
export type PreviewChoice = { type: 'choice'; options: { text: string; target: string }[] }
export type PreviewItem = PreviewDialogue | PreviewChoice

/** Walk scene.children in document order (mirrors BeatCardEditor groupBeats sequencing). */
export const buildPreviewItems = (scene: SceneNode): PreviewItem[] => {
  const items: PreviewItem[] = []
  let i = 0
  while (i < scene.children.length) {
    const node = scene.children[i]
    if (node.type === 'choice') {
      const group: ChoiceNode[] = []
      while (i < scene.children.length && scene.children[i]?.type === 'choice') {
        group.push(scene.children[i] as ChoiceNode)
        i++
      }
      for (const c of group) {
        items.push({ type: 'choice', options: c.options })
      }
      continue
    }
    if (node.type === 'dialogue') {
      const d = node as DialogueNode
      for (const line of d.lines) {
        items.push({ type: 'dialogue', character: d.character, text: line })
      }
    }
    i++
  }
  return items
}

export const collectSceneChildKinds = (scene: SceneNode): AstNode['type'][] =>
  scene.children.map((n) => n.type)
