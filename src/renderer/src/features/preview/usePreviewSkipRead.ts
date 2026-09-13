/**
 * usePreviewSkipRead — 已读跳过
 *
 * 开启后以快进节奏自动推进;遇到未读对白或选项时自动关闭(交还控制)。
 * 与 usePreviewAutoPlay 互斥使用由调用方保证(同屏只开一个定时器源)。
 */
import { useEffect, useState } from 'react'
import { isRead, dialogueLineId } from '../../../../shared/preview/runtime-vm'
import type { PlaybackStep } from '../../../../shared/preview/playback-timeline'
import type { VmReadState } from '../../../../shared/preview/runtime-vm'

export const SKIP_READ_INTERVAL_MS = 150

export interface UsePreviewSkipReadOptions {
  advance: () => void
  currentStep: PlaybackStep | null
  readState: VmReadState
  sceneId: string | null
}

export interface UsePreviewSkipReadResult {
  skipRead: boolean
  setSkipRead: (value: boolean) => void
}

export const currentLineIsRead = (
  step: PlaybackStep | null,
  readState: VmReadState,
  sceneId: string | null
): boolean | null => {
  if (step?.type !== 'dialogue' || !sceneId) return null
  return isRead(readState, dialogueLineId(sceneId, step.character, step.text))
}

export const usePreviewSkipRead = ({
  advance,
  currentStep,
  readState,
  sceneId
}: UsePreviewSkipReadOptions): UsePreviewSkipReadResult => {
  const [skipRead, setSkipRead] = useState(false)

  const lineRead = currentLineIsRead(currentStep, readState, sceneId)
  const stopReason =
    currentStep === null
      ? 'end'
      : currentStep.type === 'choice'
        ? 'choice'
        : lineRead === false
          ? 'unread'
          : null

  useEffect(() => {
    if (!skipRead) return
    if (stopReason !== null) {
      setSkipRead(false)
      return
    }
    const id = setInterval(() => advance(), SKIP_READ_INTERVAL_MS)
    return () => clearInterval(id)
  }, [skipRead, stopReason, advance])

  return { skipRead, setSkipRead }
}
