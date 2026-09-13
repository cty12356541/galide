/**
 * generate-background-service — 背景图生成 + 写盘(与 generate-sprite-service 同构)
 *
 * provider/baseUrl/尺寸/轮询预算默认取 image 偏好(本地 ComfyUI),
 * 显式参数覆盖;产出 assets/backgrounds/<name>.png。
 */
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { generateImage, type ImageProvider } from '../ai/image/image-proxy.js'
import { getPreference } from '../preferences/preferences-store.js'

export type GenerateBackgroundInput = {
  projectPath: string
  /** 背景名(slug,如 bookstore);输出 assets/backgrounds/<name>.png */
  name: string
  prompt: string
  negativePrompt?: string
  provider?: ImageProvider
  seed?: number
  width?: number
  height?: number
  /** 覆盖 image 偏好中的端点 */
  baseUrl?: string
}

export type GenerateBackgroundResult =
  | { ok: true; path: string; seed?: number }
  | { ok: false; code: string; error: string }

export const BACKGROUND_NAME_RE = /^[a-zA-Z0-9_-]+$/

export const generateBackgroundService = async (
  input: GenerateBackgroundInput
): Promise<GenerateBackgroundResult> => {
  if (!BACKGROUND_NAME_RE.test(input.name)) {
    return { ok: false, code: 'INVALID_NAME', error: 'name 只能包含字母、数字、下划线、连字符' }
  }
  const prompt = input.prompt?.trim()
  if (!prompt) {
    return { ok: false, code: 'NO_PROMPT', error: 'prompt 不能为空' }
  }

  const prefs = getPreference('image')
  const provider = input.provider ?? prefs.defaultProvider
  const width = input.width ?? prefs.width
  const height = input.height ?? prefs.height
  const pollIntervalMs = 1000
  const maxPollAttempts = Math.max(1, Math.ceil(prefs.pollTimeoutMs / pollIntervalMs))

  const gen = await generateImage(
    {
      provider,
      prompt,
      negativePrompt: input.negativePrompt,
      seed: input.seed,
      width,
      height,
      baseUrl: input.baseUrl ?? prefs.baseUrl
    },
    { maxPollAttempts, pollIntervalMs }
  )
  if (gen.ok === false) {
    return { ok: false, code: gen.code, error: gen.message }
  }

  const relPath = `assets/backgrounds/${input.name}.png`
  const absPath = join(input.projectPath, relPath)
  await fs.mkdir(dirname(absPath), { recursive: true })
  await fs.writeFile(absPath, Buffer.from(gen.imageBase64, 'base64'))
  return { ok: true, path: relPath, seed: gen.seed }
}
