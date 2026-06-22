/**
 * PreviewVoiceController — 对白 TTS 播放(与 BGM preview-audio 独立)
 */

export interface PreviewVoiceDeps {
  resolveAudioUrl: (relPath: string) => Promise<string | undefined>
  generateVoice: (
    lineId: string,
    text: string,
    characterId: string
  ) => Promise<{ ok: boolean; path?: string; error?: string }>
  onError?: (message: string) => void
}

export interface PreviewVoiceController {
  playDialogue: (lineId: string, text: string, characterId: string) => Promise<void>
  stop: () => void
  setMuted: (muted: boolean) => void
  dispose: () => void
}

export const createPreviewVoiceController = (
  deps: PreviewVoiceDeps
): PreviewVoiceController => {
  let audio: HTMLAudioElement | null = null
  let muted = false
  let playingId: string | null = null

  const stop = (): void => {
    if (audio) {
      audio.pause()
      audio.src = ''
      audio = null
    }
    playingId = null
  }

  const playDialogue = async (
    lineId: string,
    text: string,
    characterId: string
  ): Promise<void> => {
    if (muted || !text.trim()) return
    if (playingId === lineId && audio && !audio.paused) return

    stop()
    playingId = lineId

    let relPath = `assets/voice/${lineId}.mp3`
    let url = await deps.resolveAudioUrl(relPath)
    if (!url) {
      const gen = await deps.generateVoice(lineId, text, characterId)
      if (!gen.ok || !gen.path) {
        playingId = null
        deps.onError?.(gen.error ?? '语音生成失败')
        return
      }
      relPath = gen.path
      url = await deps.resolveAudioUrl(relPath)
    }
    if (!url) {
      playingId = null
      return
    }

    const el = new Audio(url)
    audio = el
    el.onended = () => {
      if (audio === el) {
        audio = null
        playingId = null
      }
    }
    el.onerror = () => {
      if (audio === el) {
        audio = null
        playingId = null
      }
    }
    try {
      await el.play()
    } catch (err) {
      console.warn(`[galide preview] 对白 TTS 播放失败: ${lineId}`, err)
      stop()
    }
  }

  const setMuted = (m: boolean): void => {
    muted = m
    if (muted) stop()
  }

  const dispose = (): void => {
    stop()
  }

  return { playDialogue, stop, setMuted, dispose }
}
