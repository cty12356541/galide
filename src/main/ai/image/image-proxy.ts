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
  sleep?: (ms: number) => Promise<void>
  maxPollAttempts?: number
  pollIntervalMs?: number
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

/** 最小 txt2img workflow(Checkpoint → KSampler → VAEDecode → SaveImage) */
export const buildComfyWorkflow = (req: ImageGenRequest, seed: number): Record<string, unknown> => ({
  '3': {
    class_type: 'KSampler',
    inputs: {
      seed,
      steps: 20,
      cfg: 8,
      sampler_name: 'euler',
      scheduler: 'normal',
      denoise: 1,
      model: ['4', 0],
      positive: ['6', 0],
      negative: ['7', 0],
      latent_image: ['5', 0]
    }
  },
  '4': {
    class_type: 'CheckpointLoaderSimple',
    inputs: { ckpt_name: 'model.safetensors' }
  },
  '5': {
    class_type: 'EmptyLatentImage',
    inputs: {
      width: req.width ?? 512,
      height: req.height ?? 768,
      batch_size: 1
    }
  },
  '6': {
    class_type: 'CLIPTextEncode',
    inputs: { text: req.prompt, clip: ['4', 1] }
  },
  '7': {
    class_type: 'CLIPTextEncode',
    inputs: { text: req.negativePrompt ?? '', clip: ['4', 1] }
  },
  '8': {
    class_type: 'VAEDecode',
    inputs: { samples: ['3', 0], vae: ['4', 2] }
  },
  '9': {
    class_type: 'SaveImage',
    inputs: { filename_prefix: 'galide', images: ['8', 0] }
  }
})

interface ComfyHistoryImage {
  filename: string
  subfolder?: string
  type?: string
}

interface ComfyHistoryEntry {
  outputs?: Record<string, { images?: ComfyHistoryImage[] }>
}

const extractComfyImages = (entry: ComfyHistoryEntry | undefined): ComfyHistoryImage[] => {
  if (!entry?.outputs) return []
  const images: ComfyHistoryImage[] = []
  for (const output of Object.values(entry.outputs)) {
    if (output.images?.length) images.push(...output.images)
  }
  return images
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const generateComfyUI = async (
  req: ImageGenRequest,
  seed: number,
  fetchFn: typeof fetch,
  sleep: (ms: number) => Promise<void>,
  maxPollAttempts: number,
  pollIntervalMs: number
): Promise<ImageGenResponse> => {
  const base = req.baseUrl ?? DEFAULT_COMFY_BASE
  const workflow = buildComfyWorkflow(req, seed)
  const submitResp = await fetchFn(`${base}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow })
  })
  if (!submitResp.ok) {
    return { ok: false, code: 'HTTP_ERROR', message: `ComfyUI HTTP ${submitResp.status}` }
  }
  const submitJson = (await submitResp.json()) as { prompt_id?: string }
  const promptId = submitJson.prompt_id
  if (!promptId) {
    return { ok: false, code: 'INVALID_RESPONSE', message: 'ComfyUI 未返回 prompt_id' }
  }

  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    const histResp = await fetchFn(`${base}/history/${promptId}`)
    if (!histResp.ok) {
      return { ok: false, code: 'HTTP_ERROR', message: `ComfyUI history HTTP ${histResp.status}` }
    }
    const hist = (await histResp.json()) as Record<string, ComfyHistoryEntry>
    const images = extractComfyImages(hist[promptId])
    if (images.length > 0) {
      const img = images[0]
      const viewUrl =
        `${base}/view?filename=${encodeURIComponent(img.filename)}` +
        `&subfolder=${encodeURIComponent(img.subfolder ?? '')}` +
        `&type=${encodeURIComponent(img.type ?? 'output')}`
      const viewResp = await fetchFn(viewUrl)
      if (!viewResp.ok) {
        return { ok: false, code: 'HTTP_ERROR', message: `ComfyUI view HTTP ${viewResp.status}` }
      }
      const buf = await viewResp.arrayBuffer()
      return { ok: true, imageBase64: arrayBufferToBase64(buf), seed }
    }
    if (attempt < maxPollAttempts - 1) {
      await sleep(pollIntervalMs)
    }
  }
  return { ok: false, code: 'GENERATION_FAILED', message: 'ComfyUI 生成超时' }
}

export const generateImage = async (
  req: ImageGenRequest,
  deps: ImageProxyDeps = {}
): Promise<ImageGenResponse> => {
  const fetchFn = deps.fetchFn ?? fetch
  const getApiKey = deps.getApiKey ?? (() => apiKeyStore.get('openai'))
  const sleep = deps.sleep ?? defaultSleep
  const maxPollAttempts = deps.maxPollAttempts ?? 60
  const pollIntervalMs = deps.pollIntervalMs ?? 1000
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

    // comfyui — 提交 workflow,轮询 history,经 /view 取图
    return generateComfyUI(req, seed, fetchFn, sleep, maxPollAttempts, pollIntervalMs)
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
  buildComfyWorkflow,
  arrayBufferToBase64
}
