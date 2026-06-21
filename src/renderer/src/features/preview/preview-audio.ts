/**
 * PreviewAudioController — BGM playback for preview chrome.
 * Voice/TTS intentionally excluded (Voice panel / export only).
 */

export interface PreviewAudioDeps {
  createContext: () => AudioContext
  loadAudio: (url: string) => Promise<ArrayBuffer>
}

export interface PreviewAudioController {
  play: (trackId: string, url: string) => Promise<void>
  stop: () => void
  setVolume: (volume: number) => void
  getVolume: () => number
  setMuted: (muted: boolean) => void
  isMuted: () => boolean
  getCurrentTrack: () => string | null
  dispose: () => void
}

interface ActiveTrack {
  id: string
  gain: GainNode
  source: AudioBufferSourceNode
}

const CROSSFADE_MS = 400

export const createPreviewAudioController = (
  deps: PreviewAudioDeps
): PreviewAudioController => {
  let ctx: AudioContext | null = null
  let masterGain: GainNode | null = null
  let active: ActiveTrack | null = null
  let fading: ActiveTrack | null = null
  let volume = 1
  let muted = false
  let currentTrackId: string | null = null

  const ensureContext = (): AudioContext => {
    if (!ctx) {
      ctx = deps.createContext()
      masterGain = ctx.createGain()
      masterGain.gain.value = muted ? 0 : volume
      masterGain.connect(ctx.destination)
    }
    return ctx
  }

  const applyMasterVolume = (): void => {
    if (masterGain) {
      masterGain.gain.value = muted ? 0 : volume
    }
  }

  const fadeOutAndStop = (track: ActiveTrack, audioCtx: AudioContext): void => {
    const now = audioCtx.currentTime
    track.gain.gain.setValueAtTime(track.gain.gain.value, now)
    track.gain.gain.linearRampToValueAtTime(0, now + CROSSFADE_MS / 1000)
    track.source.stop(now + CROSSFADE_MS / 1000 + 0.05)
  }

  const play = async (trackId: string, url: string): Promise<void> => {
    if (currentTrackId === trackId && active) return
    try {
      const audioCtx = ensureContext()
      const buffer = await deps.loadAudio(url)
      const decoded = await audioCtx.decodeAudioData(buffer.slice(0))

      if (active) {
        fading = active
        fadeOutAndStop(fading, audioCtx)
      }

      const gain = audioCtx.createGain()
      gain.gain.value = 0
      gain.connect(masterGain!)

      const source = audioCtx.createBufferSource()
      source.buffer = decoded
      source.loop = true
      source.connect(gain)
      source.start()

      const now = audioCtx.currentTime
      gain.gain.linearRampToValueAtTime(1, now + CROSSFADE_MS / 1000)

      active = { id: trackId, gain, source }
      currentTrackId = trackId
      fading = null
    } catch (err) {
      console.warn(`[galide preview] BGM 加载失败: ${trackId}`, err)
      currentTrackId = null
    }
  }

  const stop = (): void => {
    if (active && ctx) {
      fadeOutAndStop(active, ctx)
    }
    active = null
    fading = null
    currentTrackId = null
  }

  const setVolume = (v: number): void => {
    volume = Math.max(0, Math.min(1, v))
    applyMasterVolume()
  }

  const getVolume = (): number => volume

  const setMuted = (m: boolean): void => {
    muted = m
    applyMasterVolume()
  }

  const isMuted = (): boolean => muted

  const getCurrentTrack = (): string | null => currentTrackId

  const dispose = (): void => {
    stop()
    if (ctx) {
      void ctx.close()
    }
    ctx = null
    masterGain = null
  }

  return {
    play,
    stop,
    setVolume,
    getVolume,
    setMuted,
    isMuted,
    getCurrentTrack,
    dispose
  }
}
