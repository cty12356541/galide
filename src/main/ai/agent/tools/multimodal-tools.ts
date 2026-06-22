/**
 * multimodal-tools — generate_sprite / generate_voice + 批量
 */
import { dirname, join } from 'node:path'
import { promises as fs } from 'node:fs'
import * as z from 'zod/v4'
import { generateSpriteService } from '../../../image/generate-sprite-service.js'
import { readGalproj } from '../../../manifest/project-manifest.js'
import { defineTool, type RegisteredTool } from '../tool-registry.js'
import type { ToolContext, ToolHandlerResult } from '../types.js'
import { createTtsProxy } from '../../../voice/tts-proxy.js'
import {
  serializeVoiceSidecar,
  voiceSidecarAbsPath
} from '../../../../shared/voice/voice-sidecar.js'
import { getPreference } from '../../../preferences/preferences-store.js'

const readManifestCharacter = async (
  ctx: ToolContext,
  characterId: string
): Promise<{ sdPrompt?: string; voiceConfig?: { voiceId?: string } } | null> => {
  const r = await readGalproj(ctx.projectPath, (p) => ctx.fs.readFile(p))
  if (r.ok !== true) return null
  return r.value.characters?.find((c) => c.id === characterId) ?? null
}

const generateSprite = defineTool({
  name: 'generate_sprite',
  description: '为角色生成立绘并写入 assets/characters/。使用 manifest 中的 sdPrompt(若有)。',
  risk: 'destructive',
  domain: 'disk',
  schema: z.object({
    characterId: z.string().min(1),
    state: z.string().min(1),
    prompt: z.string().optional(),
    provider: z.enum(['sd', 'dalle', 'comfyui']).default('sd'),
    seed: z.number().int().optional(),
    baseUrl: z.string().optional()
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const result = await generateSpriteService({
      projectPath: ctx.projectPath,
      characterId: args.characterId,
      state: args.state,
      prompt: args.prompt,
      provider: args.provider,
      seed: args.seed,
      baseUrl: args.baseUrl
    })
    if (result.ok === false) {
      return {
        ok: false,
        content: result.error,
        error: { code: result.code, message: result.error }
      }
    }
    return {
      ok: true,
      content: `已生成立绘 ${result.path}(seed=${result.seed ?? 'n/a'})`,
      data: { path: result.path, seed: result.seed }
    }
  }
})

const generateVoice = defineTool({
  name: 'generate_voice',
  description: '为一句对白生成语音 mp3 并写入 assets/voice/。',
  risk: 'destructive',
  domain: 'disk',
  schema: z.object({
    lineId: z.string().min(1),
    text: z.string().min(1),
    characterId: z.string().min(1)
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const voicePrefs = getPreference('voice')
    const char = await readManifestCharacter(ctx, args.characterId)
    const proxy = createTtsProxy()
    const relPath = `assets/voice/${args.lineId}.mp3`
    const absPath = join(ctx.projectPath, relPath)
    await fs.mkdir(dirname(absPath), { recursive: true })
    const r = await proxy.generate(args.text, args.characterId, absPath, voicePrefs, char?.voiceConfig)
    if (r.ok === false) {
      return { ok: false, content: r.message, error: { code: r.code, message: r.message } }
    }
    await fs.writeFile(
      voiceSidecarAbsPath(ctx.projectPath, args.lineId),
      serializeVoiceSidecar({ text: args.text, characterId: args.characterId }),
      'utf-8'
    )
    return { ok: true, content: `已生成语音 ${relPath}`, data: { path: relPath } }
  }
})

const generateSpriteBatch = defineTool({
  name: 'generate_sprite_batch',
  description: '批量为多个角色状态生成立绘。',
  risk: 'destructive',
  domain: 'disk',
  schema: z.object({
    items: z.array(
      z.object({
        characterId: z.string(),
        state: z.string(),
        prompt: z.string().optional()
      })
    )
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const results: string[] = []
    for (const item of args.items) {
      const inner = await generateSprite.run(
        {
          characterId: item.characterId,
          state: item.state,
          prompt: item.prompt,
          provider: 'sd'
        },
        ctx
      )
      results.push(inner.ok ? inner.content : `失败 ${item.characterId}/${item.state}: ${inner.content}`)
    }
    return { ok: true, content: results.join('\n'), data: { count: args.items.length } }
  }
})

const generateVoiceBatch = defineTool({
  name: 'generate_voice_batch',
  description: '批量为多句对白生成语音。',
  risk: 'destructive',
  domain: 'disk',
  schema: z.object({
    items: z.array(
      z.object({
        lineId: z.string(),
        text: z.string(),
        characterId: z.string()
      })
    )
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const results: string[] = []
    for (const item of args.items) {
      const inner = await generateVoice.run(item, ctx)
      results.push(inner.ok ? inner.content : `失败 ${item.lineId}: ${inner.content}`)
    }
    return { ok: true, content: results.join('\n'), data: { count: args.items.length } }
  }
})

export const multimodalTools: readonly RegisteredTool[] = [
  generateSprite,
  generateVoice,
  generateSpriteBatch,
  generateVoiceBatch
]
