/**
 * usePreviewAudio — BGM/voice playback state and mute/volume sync hook
 */
import { useEffect, useRef, useState } from 'react'
import { createPreviewAudioController } from './preview-audio'
import { createPreviewVoiceController } from './preview-voice'

export const usePreviewAudio = (): {
  audioRef: React.MutableRefObject<ReturnType<typeof createPreviewAudioController> | null>
  voiceRef: React.MutableRefObject<ReturnType<typeof createPreviewVoiceController> | null>
  muted: boolean
  setMuted: (v: boolean | ((prev: boolean) => boolean)) => void
  volume: number
  setVolume: (v: number | ((prev: number) => number)) => void
} => {
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const audioRef = useRef<ReturnType<typeof createPreviewAudioController> | null>(null)
  const voiceRef = useRef<ReturnType<typeof createPreviewVoiceController> | null>(null)

  useEffect(() => {
    audioRef.current?.setMuted(muted)
    voiceRef.current?.setMuted(muted)
  }, [muted])

  useEffect(() => {
    audioRef.current?.setVolume(volume)
  }, [volume])

  return { audioRef, voiceRef, muted, setMuted, volume, setVolume }
}
