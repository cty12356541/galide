/**
 * Manifest schema 校验(zod)
 *
 * P2 修复:打开老项目/坏 manifest 时,不再直接信任 JSON.parse,
 * 先 schema 校验,失败返回明确错误。
 *
 * 规约: layers/main-process/conventions.yaml — manifest 入口必须校验
 */
import * as z from 'zod/v4'
import type { ProjectManifest } from './types.js'
import type { Result } from './dsl/types.js'

export const CURRENT_VERSION = '0.1.0' as const

const CharacterSpriteSchema = z.object({
  state: z.string(),
  path: z.string()
})

const CharacterCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  personality: z.string(),
  sdPrompt: z.string().optional(),
  spriteSet: z.array(CharacterSpriteSchema),
  voiceConfig: z
    .object({
      provider: z.enum(['elevenlabs', 'openai', 'edge', 'local']),
      voiceId: z.string(),
      speed: z.number().optional()
    })
    .optional()
})

const AssetsSchema = z.object({
  characters: z.string(),
  backgrounds: z.string(),
  bgm: z.string()
})

const GitSchema = z
  .object({
    initialized: z.boolean(),
    remoteUrl: z.string().optional()
  })
  .optional()

const ProjectManifestV010 = z.object({
  version: z.literal(CURRENT_VERSION),
  name: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  characters: z.array(CharacterCardSchema),
  assets: AssetsSchema,
  git: GitSchema
})

export type ManifestValidationError =
  | { code: 'INVALID_JSON'; message: string }
  | { code: 'SCHEMA_FAILED'; message: string }
  | { code: 'UNSUPPORTED_VERSION'; message: string }

export const parseManifest = (raw: string): Result<ProjectManifest, ManifestValidationError> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    return {
      ok: false,
      error: { code: 'INVALID_JSON', message: e instanceof Error ? e.message : String(e) }
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      ok: false,
      error: { code: 'INVALID_JSON', message: 'manifest root must be a JSON object, got ' + String(parsed) }
    }
  }

  // 先看 version — 不支持版本明确报错
  const obj = parsed as Record<string, unknown>
  const version = obj['version']
  if (typeof version === 'string' && version !== CURRENT_VERSION) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_VERSION',
        message: `manifest version ${JSON.stringify(version)} is not supported (expected ${CURRENT_VERSION})`
      }
    }
  }

  const result = ProjectManifestV010.safeParse(parsed)
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue?.path.join('.') ?? '<root>'
    return {
      ok: false,
      error: {
        code: 'SCHEMA_FAILED',
        message: `manifest schema failed at "${path}": ${issue?.message ?? 'unknown'}`
      }
    }
  }

  return { ok: true, value: result.data as ProjectManifest }
}
