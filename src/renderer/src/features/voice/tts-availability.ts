import type { VoicePreferences } from '@shared/preferences'

/** Edge / ElevenLabs(with key) 可用; local 为 stub */
export const isTtsUnavailable = (
  provider: VoicePreferences['defaultProvider'] | undefined,
  hasElevenLabsKey: boolean
): boolean => {
  if (!provider || provider === 'local') return true
  if (provider === 'elevenlabs' && !hasElevenLabsKey) return true
  return false
}

export const ttsUnavailableReason = (
  provider: VoicePreferences['defaultProvider'] | undefined,
  hasElevenLabsKey: boolean
): string => {
  if (provider === 'elevenlabs' && !hasElevenLabsKey) {
    return '请先在偏好 → 语音 配置 ElevenLabs API Key'
  }
  if (provider === 'local' || !provider) {
    return '本地 TTS 尚未实现,请在偏好中选择 Edge 或 ElevenLabs'
  }
  return 'TTS 不可用'
}
