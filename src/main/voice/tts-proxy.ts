/**
 * TTS 代理 — main process 封装
 * Edge TTS(免费,无 Key)优先;ElevenLabs / 本地可后续扩展。
 *
 * 可测性:synthesize / writeFile 经 deps 注入,测试不触网。
 */
import { promises as fs } from 'node:fs'

export type TtsProvider = 'edge' | 'elevenlabs' | 'local'

export type TtsResult = { ok: true; path: string } | { ok: false; code: 'NOT_IMPLEMENTED' | 'GENERATION_FAILED'; message: string }

export interface VoiceConfigLike {
  voiceId?: string
}

export interface TtsVoicePrefs {
  defaultProvider: TtsProvider
  defaultVoiceId: string
}

export interface TtsProxyDeps {
  synthesize?: (text: string, voiceId: string) => Promise<Buffer>
  writeFile?: (path: string, data: Buffer) => Promise<void>
}

const EDGE_VOICE_MAP: Record<string, string> = {
  'zh-female': 'zh-CN-XiaoxiaoNeural',
  'zh-male': 'zh-CN-YunxiNeural',
  'ja-female': 'ja-JP-NanamiNeural',
  'en-female': 'en-US-JennyNeural'
}

export const resolveVoiceId = (
  characterId: string,
  voiceConfig: VoiceConfigLike | undefined,
  defaultVoiceId: string
): string => {
  if (voiceConfig?.voiceId) return voiceConfig.voiceId
  return EDGE_VOICE_MAP[characterId] ?? defaultVoiceId
}

/** Edge Read Aloud 合成(默认实现,可被 deps.synthesize 替换) */
const defaultSynthesize = async (text: string, voiceId: string): Promise<Buffer> => {
  const tokenResp = await fetch(
    'https://edge.microsoft.com/consumer/speech/token?IsSecure=true&Secure=true',
    { headers: { 'User-Agent': 'galide/1.0' } }
  )
  if (!tokenResp.ok) throw new Error(`Edge token HTTP ${tokenResp.status}`)
  const token = (await tokenResp.text()).trim()
  const ssml = `<speak version="1.0" xml:lang="zh-CN"><voice name="${voiceId}">${text}</voice></speak>`
  const synthResp = await fetch(
    `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'galide/1.0'
      },
      body: ssml
    }
  )
  if (!synthResp.ok) throw new Error(`Edge synth HTTP ${synthResp.status}`)
  return Buffer.from(await synthResp.arrayBuffer())
}

export const createTtsProxy = (deps: TtsProxyDeps = {}) => {
  const synthesize = deps.synthesize ?? defaultSynthesize
  const writeFile = deps.writeFile ?? ((p, d) => fs.writeFile(p, d))

  return {
    generate: async (
      text: string,
      characterId: string,
      outputPath: string,
      voicePrefs: TtsVoicePrefs,
      voiceConfig?: VoiceConfigLike
    ): Promise<TtsResult> => {
      if (!text || !outputPath) {
        return { ok: false, code: 'GENERATION_FAILED', message: 'text / outputPath 不能为空' }
      }
      if (voicePrefs.defaultProvider !== 'edge') {
        return {
          ok: false,
          code: 'NOT_IMPLEMENTED',
          message: `TTS provider "${voicePrefs.defaultProvider}" 尚未实现`
        }
      }
      const voiceId = resolveVoiceId(characterId, voiceConfig, voicePrefs.defaultVoiceId)
      try {
        const audio = await synthesize(text, voiceId)
        await writeFile(outputPath, audio)
        return { ok: true, path: outputPath }
      } catch (e) {
        return {
          ok: false,
          code: 'GENERATION_FAILED',
          message: e instanceof Error ? e.message : String(e)
        }
      }
    },

    preview: async (
      text: string,
      provider: string,
      voiceId: string,
      voicePrefs: TtsVoicePrefs
    ): Promise<TtsResult> => {
      if (provider !== 'edge' && voicePrefs.defaultProvider !== 'edge') {
        return {
          ok: false,
          code: 'NOT_IMPLEMENTED',
          message: `TTS provider "${provider}" 的 preview() 尚未实现`
        }
      }
      try {
        const audio = await synthesize(text, voiceId || voicePrefs.defaultVoiceId)
        const tmp = `${outputPreviewPath()}.mp3`
        await writeFile(tmp, audio)
        return { ok: true, path: tmp }
      } catch (e) {
        return {
          ok: false,
          code: 'GENERATION_FAILED',
          message: e instanceof Error ? e.message : String(e)
        }
      }
    }
  }
}

let previewCounter = 0
const outputPreviewPath = (): string => `/tmp/galide-tts-preview-${++previewCounter}`

/** 默认单例(生产路径) */
export const ttsProxy = createTtsProxy()
