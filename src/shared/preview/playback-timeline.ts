import type {
  AstNode,
  ChoiceNode,
  DialogueNode,
  GotoNode,
  MarkerNode,
  SceneNode
} from '../dsl/types'

export interface PlaybackDialogueStep {
  type: 'dialogue'
  character: string
  text: string
  sprite?: string
  position?: 'left' | 'right' | 'center'
}

export interface PlaybackChoiceStep {
  type: 'choice'
  options: { text: string; target: string }[]
}

export interface PlaybackGotoStep {
  type: 'goto'
  target: string
}

export interface PlaybackMarkerStep {
  type: 'marker'
  id: string
}

export type PlaybackStep =
  | PlaybackDialogueStep
  | PlaybackChoiceStep
  | PlaybackGotoStep
  | PlaybackMarkerStep

/** Walk scene.children in document order (mirrors BeatCardEditor groupBeats sequencing). */
export const buildPlaybackTimeline = (scene: SceneNode): PlaybackStep[] => {
  const steps: PlaybackStep[] = []
  let i = 0
  while (i < scene.children.length) {
    const node = scene.children[i]
    if (!node) {
      i++
      continue
    }
    if (node.type === 'choice') {
      const group: ChoiceNode[] = []
      while (i < scene.children.length && scene.children[i]?.type === 'choice') {
        const c = scene.children[i]
        if (c?.type === 'choice') group.push(c)
        i++
      }
      for (const c of group) {
        steps.push({ type: 'choice', options: c.options })
      }
      continue
    }
    appendNodeStep(node, steps)
    i++
  }
  return steps
}

const appendNodeStep = (node: AstNode, steps: PlaybackStep[]): void => {
  switch (node.type) {
    case 'dialogue': {
      const d = node as DialogueNode
      for (const line of d.lines) {
        steps.push({
          type: 'dialogue',
          character: d.character,
          text: line,
          ...(d.sprite !== undefined ? { sprite: d.sprite } : {}),
          ...(d.position !== undefined ? { position: d.position } : {})
        })
      }
      break
    }
    case 'goto':
      steps.push({ type: 'goto', target: (node as GotoNode).target })
      break
    case 'marker':
      steps.push({ type: 'marker', id: (node as MarkerNode).id })
      break
    default:
      break
  }
}
