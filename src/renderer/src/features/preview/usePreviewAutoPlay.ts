import { useEffect, useState } from 'react'
import type { PlaybackStep } from '../../../../shared/preview/playback-timeline'

export const AUTO_PLAY_INTERVAL_MS = 1500

/** 自动播放速度档(循环切换):慢 1.5s → 中 1.0s → 快 0.6s */
export const AUTO_PLAY_SPEEDS: readonly number[] = [1500, 1000, 600]
export const AUTO_PLAY_SPEED_LABELS: readonly string[] = ['慢', '中', '快']

const isAutoPlayableStep = (step: PlaybackStep | null): boolean =>
  step !== null &&
  (step.type === 'dialogue' || step.type === 'marker' || step.type === 'set' || step.type === 'stage')

export interface UsePreviewAutoPlayOptions {
  advance: () => void
  currentStep: PlaybackStep | null
}

export interface UsePreviewAutoPlayResult {
  autoPlay: boolean
  setAutoPlay: (value: boolean) => void
  canAutoPlay: boolean
  speedIndex: number
  /** 循环切换到下一档速度 */
  cycleSpeed: () => void
  intervalMs: number
}

export const usePreviewAutoPlay = ({
  advance,
  currentStep
}: UsePreviewAutoPlayOptions): UsePreviewAutoPlayResult => {
  const [autoPlay, setAutoPlay] = useState(false)
  const [speedIndex, setSpeedIndex] = useState(0)
  const canAutoPlay = isAutoPlayableStep(currentStep)
  const intervalMs = AUTO_PLAY_SPEEDS[speedIndex] ?? AUTO_PLAY_INTERVAL_MS

  const cycleSpeed = (): void => {
    setSpeedIndex((i) => (i + 1) % AUTO_PLAY_SPEEDS.length)
  }

  useEffect(() => {
    if (!autoPlay) return
    if (!canAutoPlay) return
    const id = setInterval(() => advance(), intervalMs)
    return () => clearInterval(id)
  }, [autoPlay, advance, canAutoPlay, intervalMs])

  return { autoPlay, setAutoPlay, canAutoPlay, speedIndex, cycleSpeed, intervalMs }
}
