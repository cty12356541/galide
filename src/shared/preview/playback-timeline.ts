import type {
  AstNode,
  ChoiceNode,
  ChoiceOption,
  DialogueNode,
  Expression,
  GotoNode,
  IfBranchKind,
  IfNode,
  MarkerNode,
  SceneNode,
  SetNode,
  SetOp
} from '../dsl/types'

export interface PlaybackDialogueStep {
  type: 'dialogue'
  character: string
  text: string
  sprite?: string
  position?: 'left' | 'right' | 'center'
}

export interface PlaybackChoiceOption {
  text: string
  target: string
  condition?: Expression
}

export interface PlaybackChoiceStep {
  type: 'choice'
  options: PlaybackChoiceOption[]
}

export interface PlaybackGotoStep {
  type: 'goto'
  target: string
}

export interface PlaybackMarkerStep {
  type: 'marker'
  id: string
}

export interface PlaybackSetStep {
  type: 'set'
  name: string
  op: SetOp
  value: Expression
}

export interface PlaybackIfBranch {
  kind: IfBranchKind
  condition?: Expression
  steps: PlaybackStep[]
}

export interface PlaybackIfStep {
  type: 'if'
  branches: PlaybackIfBranch[]
}

export type PlaybackStep =
  | PlaybackDialogueStep
  | PlaybackChoiceStep
  | PlaybackGotoStep
  | PlaybackMarkerStep
  | PlaybackSetStep
  | PlaybackIfStep

const buildStepsFromNodes = (nodes: AstNode[]): PlaybackStep[] => {
  const steps: PlaybackStep[] = []
  let i = 0
  while (i < nodes.length) {
    const node = nodes[i]
    if (!node) {
      i++
      continue
    }
    if (node.type === 'choice') {
      const group: ChoiceNode[] = []
      while (i < nodes.length && nodes[i]?.type === 'choice') {
        const c = nodes[i]
        if (c?.type === 'choice') group.push(c)
        i++
      }
      for (const c of group) {
        steps.push({
          type: 'choice',
          options: c.options.map((o: ChoiceOption) => ({
            text: o.text,
            target: o.target,
            ...(o.condition !== undefined ? { condition: o.condition } : {})
          }))
        })
      }
      continue
    }
    appendNodeStep(node, steps)
    i++
  }
  return steps
}

/** Walk scene.children in document order (mirrors BeatCardEditor groupBeats sequencing). */
export const buildPlaybackTimeline = (scene: SceneNode): PlaybackStep[] =>
  buildStepsFromNodes(scene.children)

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
    case 'set': {
      const s = node as SetNode
      steps.push({ type: 'set', name: s.name, op: s.op, value: s.value })
      break
    }
    case 'if': {
      const n = node as IfNode
      steps.push({
        type: 'if',
        branches: n.branches.map((b) => ({
          kind: b.kind,
          ...(b.condition !== undefined ? { condition: b.condition } : {}),
          steps: buildStepsFromNodes(b.children)
        }))
      })
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
