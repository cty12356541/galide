/**
 * generate-sprite-service — 立绘生成 + 写盘 + manifest 补丁(IPC 与 Agent 共用)
 */
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { imageProxy } from '../ai/image/image-proxy.js'
import { patchCharacterSpriteSet } from '../manifest/character-sprite.js'
import { readGalproj } from '../manifest/project-manifest.js'

export type GenerateSpriteInput = {
  projectPath: string
  characterId: string
  state: string
  prompt?: string
  provider?: 'sd' | 'dalle' | 'comfyui'
  seed?: number
  baseUrl?: string
}

export type GenerateSpriteResult =
  | { ok: true; path: string; seed?: number }
  | { ok: false; code: string; error: string }

export const generateSpriteService = async (
  input: GenerateSpriteInput
): Promise<GenerateSpriteResult> => {
  let prompt = input.prompt?.trim()
  if (!prompt) {
    const manifest = await readGalproj(input.projectPath, (p) => fs.readFile(p, 'utf-8'))
    if (manifest.ok === true) {
      prompt = manifest.value.characters.find((c) => c.id === input.characterId)?.sdPrompt?.trim()
    }
  }
  if (!prompt) {
    return { ok: false, code: 'NO_PROMPT', error: 'prompt 不能为空' }
  }

  const provider = input.provider ?? 'sd'
  const gen = await imageProxy.generate({
    provider,
    prompt,
    seed: input.seed,
    baseUrl: input.baseUrl
  })
  if (gen.ok === false) {
    return { ok: false, code: gen.code, error: gen.message }
  }

  const relPath = `assets/characters/${input.characterId}_${input.state}.png`
  const absPath = join(input.projectPath, relPath)
  await fs.mkdir(dirname(absPath), { recursive: true })
  await fs.writeFile(absPath, Buffer.from(gen.imageBase64, 'base64'))

  const patch = await patchCharacterSpriteSet(
    input.projectPath,
    input.characterId,
    input.state,
    relPath,
    (p) => fs.readFile(p, 'utf-8'),
    (p, c) => fs.writeFile(p, c)
  )
  if (patch.ok === false) {
    return { ok: false, code: 'MANIFEST_PATCH_FAILED', error: patch.error }
  }
  return { ok: true, path: relPath, seed: gen.seed }
}
