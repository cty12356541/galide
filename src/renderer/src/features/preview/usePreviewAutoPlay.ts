import { useEffect, useState } from 'react'
import type { PlaybackStep } from '../../../../shared/preview/playback-timeline'

export const AUTO_PLAY_INTERVAL_MS = 1500

const isAutoPlayableStep = (step: PlaybackStep | null): boolean =>
  step !== null && (step.type === 'dialogue' || step.type === 'marker' || step.type === 'set')

export interface UsePreviewAutoPlayOptions {
  advance: () => void
  currentStep: PlaybackStep | null
}

export interface UsePreviewAutoPlayResult {
  autoPlay: boolean
  setAutoPlay: (value: boolean) => void
  canAutoPlay: boolean
}

export const usePreviewAutoPlay = ({
  advance,
  currentStep
}: UsePreviewAutoPlayOptions): UsePreviewAutoPlayResult => {
  const [autoPlay, setAutoPlay] = useState(false)
  const canAutoPlay = isAutoPlayableStep(currentStep)

  useEffect(() => {
    if (!autoPlay) return
    if (!canAutoPlay) return
    const id = setInterval(() => advance(), AUTO_PLAY_INTERVAL_MS)
    return () => clearInterval(id)
  }, [autoPlay, advance, canAutoPlay])

  return { autoPlay, setAutoPlay, canAutoPlay }
}
