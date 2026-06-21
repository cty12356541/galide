/**
 * TTS 代理 — main process 封装
 * Edge TTS(免费,无 Key)默认;ElevenLabs 经 REST API;本地可后续扩展。
 *
 * 可测性:synthesize / fetchFn / writeFile 经 deps 注入,测试不触网。
 */
import { promises as fs } from 'node:fs'
import { apiKeyStore } from '../ai/key-store.js'

export type TtsProvider = 'edge' | 'elevenlabs' | 'local'

export type TtsResult =
  | { ok: true; path: string }
  | {
      ok: false
      code: 'NOT_IMPLEMENTED' | 'NO_API_KEY' | 'PROVIDER_ERROR' | 'GENERATION_FAILED'
      message: string
    }

export interface VoiceConfigLike {
  voiceId?: string
}

export interface TtsVoicePrefs {
  defaultProvider: TtsProvider
  defaultVoiceId: string
}

export interface TtsProxyDeps {
  synthesize?: (text: string, voiceId: string) => Promise<Buffer>
  fetchFn?: typeof fetch
  getApiKey?: () => string | undefined
  writeFile?: (path: string, data: Buffer) => Promise<void>
}

const EDGE_VOICE_MAP: Record<string, string> = {
  'zh-female': 'zh-CN-XiaoxiaoNeural',
  'zh-male': 'zh-CN-YunxiNeural',
  'ja-female': 'ja-JP-NanamiNeural',
  'en-female': 'en-US-JennyNeural'
}

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1'
const ELEVENLABS_MODEL = 'eleven_multilingual_v2'

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

const synthesizeElevenLabs = async (
  text: string,
  voiceId: string,
  apiKey: string,
  fetchFn: typeof fetch
): Promise<Buffer> => {
  const resp = await fetchFn(`${ELEVENLABS_API}/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg'
    },
    body: JSON.stringify({ text, model_id: ELEVENLABS_MODEL })
  })
  if (!resp.ok) {
    throw new Error(`ElevenLabs HTTP ${resp.status}`)
  }
  return Buffer.from(await resp.arrayBuffer())
}

export const createTtsProxy = (deps: TtsProxyDeps = {}) => {
  const synthesize = deps.synthesize ?? defaultSynthesize
  const fetchFn = deps.fetchFn ?? fetch
  const getApiKey = deps.getApiKey ?? (() => apiKeyStore.get('elevenlabs'))
  const writeFile = deps.writeFile ?? ((p, d) => fs.writeFile(p, d))

  const synthesizeForProvider = async (
    provider: TtsProvider,
    text: string,
    voiceId: string
  ): Promise<Buffer | TtsResult> => {
    if (provider === 'edge') {
      return synthesize(text, voiceId)
    }
    if (provider === 'elevenlabs') {
      const apiKey = getApiKey()
      if (!apiKey) {
        return { ok: false, code: 'NO_API_KEY', message: '未配置 ElevenLabs API Key' }
      }
      try {
        return await synthesizeElevenLabs(text, voiceId, apiKey, fetchFn)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        if (message.includes('ElevenLabs HTTP')) {
          return { ok: false, code: 'PROVIDER_ERROR', message }
        }
        throw e
      }
    }
    return {
      ok: false,
      code: 'NOT_IMPLEMENTED',
      message: `TTS provider "${provider}" 尚未实现`
    }
  }

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
      const voiceId = resolveVoiceId(characterId, voiceConfig, voicePrefs.defaultVoiceId)
      try {
        const audioOrErr = await synthesizeForProvider(voicePrefs.defaultProvider, text, voiceId)
        if ('ok' in audioOrErr && audioOrErr.ok === false) return audioOrErr
        const audio = audioOrErr as Buffer
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
      const activeProvider = (provider || voicePrefs.defaultProvider) as TtsProvider
      if (activeProvider === 'local') {
        return {
          ok: false,
          code: 'NOT_IMPLEMENTED',
          message: `TTS provider "${activeProvider}" 的 preview() 尚未实现`
        }
      }
      try {
        const resolvedVoice = voiceId || voicePrefs.defaultVoiceId
        const audioOrErr = await synthesizeForProvider(activeProvider, text, resolvedVoice)
        if ('ok' in audioOrErr && audioOrErr.ok === false) return audioOrErr
        const audio = audioOrErr as Buffer
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
