import type { SceneNode } from '../../../../shared/dsl/types'
import {
  buildPlaybackTimeline,
  type PlaybackChoiceStep,
  type PlaybackDialogueStep,
  type PlaybackStep
} from '../../../../shared/preview/playback-timeline'

/** @deprecated Use PlaybackDialogueStep from shared/preview/playback-timeline */
export type PreviewDialogue = PlaybackDialogueStep
/** @deprecated Use PlaybackChoiceStep from shared/preview/playback-timeline */
export type PreviewChoice = PlaybackChoiceStep
export type PreviewItem = PlaybackDialogueStep | PlaybackChoiceStep

/** Walk scene.children in document order — delegates to shared playback timeline. */
export const buildPreviewItems = (scene: SceneNode): PreviewItem[] =>
  buildPlaybackTimeline(scene).filter(
    (step): step is PreviewItem => step.type === 'dialogue' || step.type === 'choice'
  )

export const collectSceneChildKinds = (scene: SceneNode): PlaybackStep['type'][] =>
  buildPlaybackTimeline(scene).map((s) => s.type)
