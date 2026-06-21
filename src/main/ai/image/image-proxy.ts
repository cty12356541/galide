/**
 * image-proxy — SD / DALL-E / ComfyUI 图像生成代理(main 进程)
 *
 * 可测性:HTTP 经 deps.fetchFn 注入,测试 mock 请求体与响应。
 * seed / referenceImage 一致性:同一 seed + prompt 应产生相同请求参数(见 image-proxy.test.ts)。
 */
import { apiKeyStore } from '../key-store.js'

export type ImageProvider = 'sd' | 'dalle' | 'comfyui'

export interface ImageGenRequest {
  provider: ImageProvider
  prompt: string
  negativePrompt?: string
  seed?: number
  width?: number
  height?: number
  /** base64 参考图(可选,用于 img2img 一致性) */
  referenceImageBase64?: string
  /** SD WebUI / ComfyUI 端点 */
  baseUrl?: string
}

export interface ImageGenResult {
  ok: true
  imageBase64: string
  seed: number
}

export interface ImageGenError {
  ok: false
  code: 'NO_API_KEY' | 'HTTP_ERROR' | 'INVALID_RESPONSE' | 'GENERATION_FAILED'
  message: string
}

export type ImageGenResponse = ImageGenResult | ImageGenError

export interface ImageProxyDeps {
  fetchFn?: typeof fetch
  getApiKey?: () => string | undefined
}

const DEFAULT_SD_BASE = 'http://127.0.0.1:7860'
const DEFAULT_COMFY_BASE = 'http://127.0.0.1:8188'

const pickSeed = (seed?: number): number => seed ?? Math.floor(Math.random() * 2_147_483_647)

const arrayBufferToBase64 = (buf: ArrayBuffer): string => Buffer.from(buf).toString('base64')

export const buildSdPayload = (req: ImageGenRequest, seed: number): Record<string, unknown> => ({
  prompt: req.prompt,
  negative_prompt: req.negativePrompt ?? '',
  seed,
  width: req.width ?? 512,
  height: req.height ?? 768,
  steps: 20,
  ...(req.referenceImageBase64
    ? { init_images: [req.referenceImageBase64], denoising_strength: 0.55 }
    : {})
})

export const buildDallePayload = (req: ImageGenRequest): Record<string, unknown> => ({
  model: 'dall-e-3',
  prompt: req.prompt,
  n: 1,
  size: `${req.width ?? 1024}x${req.height ?? 1024}`,
  response_format: 'b64_json'
})

export const generateImage = async (
  req: ImageGenRequest,
  deps: ImageProxyDeps = {}
): Promise<ImageGenResponse> => {
  const fetchFn = deps.fetchFn ?? fetch
  const getApiKey = deps.getApiKey ?? (() => apiKeyStore.get('openai'))
  const seed = pickSeed(req.seed)

  try {
    if (req.provider === 'dalle') {
      const apiKey = getApiKey()
      if (!apiKey) return { ok: false, code: 'NO_API_KEY', message: '未配置 OpenAI API Key' }
      const resp = await fetchFn('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildDallePayload(req))
      })
      if (!resp.ok) {
        return { ok: false, code: 'HTTP_ERROR', message: `DALL-E HTTP ${resp.status}` }
      }
      const json = (await resp.json()) as { data?: Array<{ b64_json?: string }> }
      const b64 = json.data?.[0]?.b64_json
      if (!b64) return { ok: false, code: 'INVALID_RESPONSE', message: 'DALL-E 响应无图像' }
      return { ok: true, imageBase64: b64, seed }
    }

    if (req.provider === 'sd') {
      const base = req.baseUrl ?? DEFAULT_SD_BASE
      const resp = await fetchFn(`${base}/sdapi/v1/txt2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSdPayload(req, seed))
      })
      if (!resp.ok) {
        return { ok: false, code: 'HTTP_ERROR', message: `SD HTTP ${resp.status}` }
      }
      const json = (await resp.json()) as { images?: string[] }
      const img = json.images?.[0]
      if (!img) return { ok: false, code: 'INVALID_RESPONSE', message: 'SD 响应无图像' }
      return { ok: true, imageBase64: img, seed }
    }

    // comfyui — 最简 workflow 占位(POST prompt,轮询 history)
    const base = req.baseUrl ?? DEFAULT_COMFY_BASE
    const workflow = {
      prompt: req.prompt,
      seed,
      width: req.width ?? 512,
      height: req.height ?? 768
    }
    const resp = await fetchFn(`${base}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow })
    })
    if (!resp.ok) {
      return { ok: false, code: 'HTTP_ERROR', message: `ComfyUI HTTP ${resp.status}` }
    }
    const json = (await resp.json()) as { image?: string }
    if (json.image) return { ok: true, imageBase64: json.image, seed }
    return { ok: false, code: 'INVALID_RESPONSE', message: 'ComfyUI 响应无图像' }
  } catch (e) {
    return {
      ok: false,
      code: 'GENERATION_FAILED',
      message: e instanceof Error ? e.message : String(e)
    }
  }
}

/** 把 base64 图像写入磁盘(工具层使用) */
export const writeImageBase64 = async (
  outputPath: string,
  imageBase64: string,
  writeFile: (path: string, data: Buffer) => Promise<void>
): Promise<void> => {
  await writeFile(outputPath, Buffer.from(imageBase64, 'base64'))
}

export const imageProxy = {
  generate: generateImage,
  buildSdPayload,
  buildDallePayload,
  arrayBufferToBase64
}
