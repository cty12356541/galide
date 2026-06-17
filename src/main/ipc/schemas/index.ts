/**
 * IPC 边界 zod schema
 *
 * 规约依据: languages/typescript/conventions.yaml + layers/main-process/conventions.yaml:12-15
 *   "所有 IPC 错误通过 error channel 返回,包含 code + message"
 *   "业务错误返回结构化 Result 类型,不抛异常"
 *
 * 实施: 每个 IPC handler 入口用 schema.parse(args) 校验,失败抛 IpcSchemaError,
 *       handler 顶层 catch 后返回 { ok: false, code: 'SCHEMA_FAILED', error, issues }。
 *       Renderer 端 `wrap` 收到结构化错误而非 undefined,UI 据此给精确提示。
 *
 * 复用原则: 跨 handler 共享的 schema 集中导出;handler 私有 schema 与 handler 同文件。
 */
import * as z from 'zod/v4'

export const IpcSchemaErrorName = 'IpcSchemaError' as const

/**
 * 解析失败时抛的异常 — handler 顶层 catch 后转成 IPC 错误响应。
 * 携带 zod issues 让 renderer 端能精确提示字段。
 */
export class IpcSchemaError extends Error {
  readonly issues: z.core.$ZodIssue[]
  readonly source: string

  constructor(source: string, issues: z.core.$ZodIssue[]) {
    super(`[galide] IPC schema validation failed at "${source}"`)
    this.name = IpcSchemaErrorName
    this.source = source
    this.issues = issues
  }
}

/** 通用 helper:包一层 try/parse,失败抛 IpcSchemaError */
export const parseIpcArgs = <T>(
  source: string,
  schema: z.ZodType<T>,
  raw: unknown
): T => {
  const r = schema.safeParse(raw)
  if (!r.success) {
    throw new IpcSchemaError(source, r.error.issues)
  }
  return r.data
}

// =================== 偏好 ===================
// 镜像 src/shared/preferences.ts 的类型,保持单一事实源后这里可以重构

export const EditorPreferencesSchema = z.object({
  fontSize: z.number().int().min(8).max(64),
  tabSize: z.number().int().min(1).max(8),
  wordWrap: z.boolean(),
  lineNumbers: z.boolean(),
  minimap: z.boolean()
})

export const AppearancePreferencesSchema = z.object({
  accent: z.enum(['violet', 'blue', 'rose', 'emerald']),
  fontSans: z.string().min(1),
  fontMono: z.string().min(1),
  reducedMotion: z.boolean()
})

export const VoicePreferencesSchema = z.object({
  defaultProvider: z.enum(['edge', 'elevenlabs', 'local']),
  defaultVoiceId: z.string(),
  batchConcurrency: z.number().int().min(1).max(32)
})

export const ExportPreferencesSchema = z.object({
  defaultTarget: z.enum(['web', 'renpy', 'ink', 'json', 'electron-desktop']),
  defaultOutputDir: z.string(),
  includeAssets: z.boolean()
})

export const GitPreferencesSchema = z.object({
  autoInit: z.boolean(),
  autoCommitOnSave: z.boolean(),
  defaultAuthorName: z.string(),
  defaultAuthorEmail: z.string(),
  initialCommitMessage: z.string()
})

export const ProjectPreferencesSchema = z.object({
  recentLimit: z.number().int().min(1).max(50),
  defaultTemplate: z.string()
})

export const AdvancedPreferencesSchema = z.object({
  telemetry: z.boolean(),
  experimental: z.boolean(),
  cacheDir: z.string()
})

/** preferences.set 入口:key → schema */
export const PreferencesKeySchema = z.enum([
  'voice',
  'editor',
  'appearance',
  'export',
  'git',
  'project',
  'advanced'
])

export const PreferencesSetSchema = z.object({
  key: PreferencesKeySchema,
  value: z.unknown() // value 由 setPreference 内部按 key 派发校验
})

// =================== AI ===================

export const AiProviderSchema = z.enum(['openai', 'claude', 'ollama'])

export const AiConfigSchema = z.object({
  provider: AiProviderSchema,
  baseUrl: z.string().optional(),
  model: z.string().optional()
})

export const AiSetConfigSchema = z.object({
  provider: AiProviderSchema,
  baseUrl: z.string().optional(),
  model: z.string().optional()
})

export const AiGenerateSchema = z.object({
  prompt: z.string().min(1),
  context: z.string(),
  provider: AiProviderSchema,
  model: z.string().optional(),
  baseUrl: z.string().optional()
})

export const AiConnectionTestSchema = z.object({
  prompt: z.string().optional(),
  context: z.string().optional(),
  provider: AiProviderSchema,
  model: z.string().optional(),
  baseUrl: z.string().optional()
})

export const AiKeyProviderSchema = z.object({
  provider: AiProviderSchema
})

// =================== Script ===================

export const ScriptFileNameSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9_-]+\.gal$/, 'fileName must match [A-Za-z0-9_-]+.gal')

export const ScriptReadSchema = z.object({
  projectPath: z.string().min(1),
  fileName: ScriptFileNameSchema
})

export const ScriptWriteSchema = z.object({
  projectPath: z.string().min(1),
  fileName: ScriptFileNameSchema,
  content: z.string()
})

export const ScriptListSchema = z.object({
  projectPath: z.string().min(1)
})

export const ScriptParseSchema = z.object({
  source: z.string()
})

// =================== Project ===================

export const ProjectCreateSchema = z.object({
  name: z.string().min(1).max(80)
})

export const ProjectOpenPathSchema = z.object({
  projectPath: z.string().min(1)
})

// =================== Character ===================

export const CharacterSpriteSchema = z.object({
  state: z.string(),
  path: z.string()
})

export const CharacterVoiceConfigSchema = z.object({
  provider: z.enum(['elevenlabs', 'openai', 'edge', 'local']),
  voiceId: z.string(),
  speed: z.number().optional()
})

export const CharacterCardSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string(),
  personality: z.string(),
  spriteSet: z.array(CharacterSpriteSchema),
  voiceConfig: CharacterVoiceConfigSchema.optional()
})

export const CharacterInputSchema = CharacterCardSchema

export const CharacterCreateSchema = z.object({
  projectPath: z.string().min(1),
  character: CharacterInputSchema
})

export const CharacterUpdateSchema = z.object({
  projectPath: z.string().min(1),
  character: CharacterInputSchema
})

export const CharacterListSchema = z.object({
  projectPath: z.string().min(1)
})

export const CharacterDeleteSchema = z.object({
  projectPath: z.string().min(1),
  id: z.string().min(1)
})

// =================== Voice ===================

export const VoiceGenerateSchema = z.object({
  projectPath: z.string().min(1),
  lineId: z.string().min(1),
  text: z.string().min(1),
  characterId: z.string().min(1)
})

export const VoicePreviewSchema = z.object({
  text: z.string().min(1),
  provider: z.string().min(1),
  voiceId: z.string().min(1)
})

export const VoiceListSchema = z.object({
  projectPath: z.string().min(1)
})

export const VoiceDeleteSchema = z.object({
  projectPath: z.string().min(1),
  lineId: z.string().min(1)
})

// =================== Git ===================

/** 允许 git IPC 接受的路径前缀白名单(防穿越) */
export const GIT_PATH_ALLOWED_PREFIXES = ['scripts/', 'assets/', '.galproj'] as const

export const GitPathSchema = z
  .string()
  .min(1)
  .refine(
    (p) => GIT_PATH_ALLOWED_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix)),
    {
      message: `git path must start with one of: ${GIT_PATH_ALLOWED_PREFIXES.join(', ')}`
    }
  )

export const GitInitSchema = z.object({
  projectPath: z.string().min(1)
})

export const GitCommitSchema = z.object({
  projectPath: z.string().min(1),
  message: z.string().min(1)
})

export const GitLogSchema = z.object({
  projectPath: z.string().min(1)
})

export const GitDiffSchema = z.object({
  projectPath: z.string().min(1),
  filePath: GitPathSchema
})

export const GitStatusSchema = z.object({
  projectPath: z.string().min(1)
})

// =================== Asset ===================

export const AssetResolveSchema = z.object({
  projectPath: z.string().min(1),
  relPath: z.string().min(1)
})

// =================== Dialog / Store ===================

export const DialogChooseDirectorySchema = z.object({
  title: z.string().optional(),
  defaultPath: z.string().optional()
})

export const StoreGetSchema = z.object({
  key: z.string().min(1)
})

export const StoreSetSchema = z.object({
  key: z.string().min(1),
  value: z.unknown()
})

// =================== Export ===================

export const ExportTargetSchema = z.enum(['web', 'renpy', 'ink', 'json', 'electron-desktop'])

export const ExportRequestSchema = z.object({
  projectPath: z.string().min(1),
  target: ExportTargetSchema,
  outputPath: z.string().min(1)
})

export const ExportCancelSchema = z.object({
  jobId: z.string().min(1)
})
