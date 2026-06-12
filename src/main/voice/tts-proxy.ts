/**
 * TTS 代理 - main process 封装
 * 走 Edge TTS (免费) / ElevenLabs (付费) / 本地
 *
 * 当前状态: 三个函数均为占位实现。失败时返回明确错误码,
 * 让 UI 能区分"未实现"与"网络错误"。
 *
 * TODO(后续 release):
 * - 接入 `msedge-tts` npm 包(免费,无 Key)
 * - 接入 ElevenLabs SDK(付费,需 Key)
 */

export type TtsProvider = 'edge' | 'elevenlabs' | 'local'

export type TtsResult = { ok: true; path: string } | { ok: false; code: 'NOT_IMPLEMENTED' | 'GENERATION_FAILED'; message: string }

const EDGE_VOICE_MAP: Record<string, string> = {
  'zh-female': 'zh-CN-XiaoxiaoNeural',
  'zh-male': 'zh-CN-YunxiNeural',
  'ja-female': 'ja-JP-NanamiNeural',
  'en-female': 'en-US-JennyNeural'
}

const notImplemented = (provider: string, op: string): TtsResult => ({
  ok: false,
  code: 'NOT_IMPLEMENTED',
  message: `TTS provider "${provider}" 的 ${op}() 尚未实现,见 tts-proxy.ts 顶部 TODO`
})

export const ttsProxy = {
  /**
   * @returns TtsResult 失败时携带 code,UI 据此给精确提示(不是"未实现"还是"网络错误")
   */
  generate: async (
    text: string,
    characterId: string,
    outputPath: string
  ): Promise<TtsResult> => {
    if (!text || !outputPath) {
      return { ok: false, code: 'GENERATION_FAILED', message: 'text / outputPath 不能为空' }
    }
    const _voiceId = EDGE_VOICE_MAP[characterId] ?? EDGE_VOICE_MAP['zh-female'] ?? 'zh-CN-XiaoxiaoNeural'
    void _voiceId // 暂未使用,接入 Edge/ElevenLabs 后会用
    return notImplemented('edge', 'generate')
  },
  preview: async (text: string, provider: string, _voiceId: string): Promise<TtsResult> => {
    void text
    return notImplemented(provider, 'preview')
  }
}
