/**
 * manifest-tools — .galproj 角色 CRUD(让 agent 能管理项目元数据)
 *
 * 写工具走 patchGalproj(原子 read → mutate → write),与 IPC 层 character-service
 * 共用同一仓库接口。patchFn 内抛 ManifestLogicError 表达业务冲突(重复/不存在),
 * 由 runPatch 归一为 ToolHandlerResult,而非冒泡中断 agent 循环。
 * 写盘用 ctx.fs(.galproj 非 .gal,不触发 script:changed;UI 重开项目时重读清单)。
 *
 * 规约: layers/main-process/conventions.yaml — manifest 写入需校验;命名走 core/naming.yaml。
 */
import * as z from 'zod/v4'
import { readGalproj, patchGalproj } from '../../../manifest/project-manifest.js'
import { defineTool, type RegisteredTool } from '../tool-registry.js'
import type { ToolContext, ToolHandlerResult } from '../types.js'
import type { CharacterCard, ProjectManifest } from '../../../../shared/types.js'

/** patchFn 内抛出的业务逻辑错误(与 IO 错误区分) */
class ManifestLogicError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ManifestLogicError'
    this.code = code
  }
}

/** 跑 patchGalproj,把逻辑错误 / IO 错误归一为 ToolHandlerResult */
const runPatch = async (
  ctx: ToolContext,
  patchFn: (manifest: ProjectManifest) => void
): Promise<ToolHandlerResult> => {
  try {
    const r = await patchGalproj(ctx.projectPath, patchFn, ctx.fs)
    if (r.ok !== true) {
      return { ok: false, content: `清单操作失败: ${r.error.message}`, error: { code: r.error.code, message: r.error.message } }
    }
    return { ok: true, content: '', data: { manifest: r.value } }
  } catch (err) {
    if (err instanceof ManifestLogicError) {
      return { ok: false, content: err.message, error: { code: err.code, message: err.message } }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, content: `清单操作异常: ${message}`, error: { code: 'MANIFEST_ERROR', message } }
  }
}

const createCharacter = defineTool({
  name: 'create_character',
  description: '在 .galproj 中新建角色卡(id / name / description / personality,可选 sdPrompt)。id 必须唯一。',
  risk: 'safeWrite',
  previewable: true,
  domain: 'disk',
  schema: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    personality: z.string().min(1),
    sdPrompt: z.string().optional()
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await runPatch(ctx, (manifest) => {
      if (manifest.characters.some((c) => c.id === args.id)) {
        throw new ManifestLogicError('DUPLICATE_CHARACTER', `角色 "${args.id}" 已存在`)
      }
      const card: CharacterCard = {
        id: args.id,
        name: args.name,
        description: args.description,
        personality: args.personality,
        spriteSet: [],
        ...(args.sdPrompt !== undefined ? { sdPrompt: args.sdPrompt } : {})
      }
      manifest.characters.push(card)
    })
    if (!r.ok) return r
    return { ok: true, content: `已创建角色 "${args.name}"(${args.id})` }
  }
})

const updateCharacter = defineTool({
  name: 'update_character',
  description: '修改角色卡的 name / description / personality / sdPrompt(均可选,空串清 sdPrompt)。id 不可改。',
  risk: 'safeWrite',
  previewable: true,
  domain: 'disk',
  schema: z.object({
    id: z.string().min(1),
    name: z.string().optional(),
    description: z.string().optional(),
    personality: z.string().optional(),
    sdPrompt: z.string().optional()
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await runPatch(ctx, (manifest) => {
      const card = manifest.characters.find((c) => c.id === args.id)
      if (!card) throw new ManifestLogicError('CHARACTER_NOT_FOUND', `角色 "${args.id}" 不存在`)
      if (args.name !== undefined) card.name = args.name
      if (args.description !== undefined) card.description = args.description
      if (args.personality !== undefined) card.personality = args.personality
      if (args.sdPrompt !== undefined) {
        if (args.sdPrompt === '') delete card.sdPrompt
        else card.sdPrompt = args.sdPrompt
      }
    })
    if (!r.ok) return r
    return { ok: true, content: `已更新角色 "${args.id}"` }
  }
})

const deleteCharacter = defineTool({
  name: 'delete_character',
  description: '从 .galproj 中删除角色卡(按 id)。不清理 assets/ 下的立绘文件。',
  risk: 'safeWrite',
  previewable: true,
  domain: 'disk',
  schema: z.object({ id: z.string().min(1) }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await runPatch(ctx, (manifest) => {
      const idx = manifest.characters.findIndex((c) => c.id === args.id)
      if (idx < 0) throw new ManifestLogicError('CHARACTER_NOT_FOUND', `角色 "${args.id}" 不存在`)
      manifest.characters.splice(idx, 1)
    })
    if (!r.ok) return r
    return { ok: true, content: `已删除角色 "${args.id}"` }
  }
})

const listCharacters = defineTool({
  name: 'list_characters',
  description: '列出 .galproj 中所有角色(id / name / 性格 / 立绘数)。',
  risk: 'read',
  domain: 'disk',
  schema: z.object({}),
  handler: async (_args, ctx): Promise<ToolHandlerResult> => {
    const r = await readGalproj(ctx.projectPath, (p) => ctx.fs.readFile(p))
    if (r.ok !== true) {
      return { ok: false, content: `读取角色失败: ${r.error.message}`, error: { code: r.error.code, message: r.error.message } }
    }
    const lines = r.value.characters.map(
      (c) => `- ${c.name}(${c.id}): ${c.personality} — 立绘 ${c.spriteSet.length} 张`
    )
    return {
      ok: true,
      content: lines.length > 0 ? lines.join('\n') : '(无角色)',
      data: { count: r.value.characters.length }
    }
  }
})

export const manifestTools: readonly RegisteredTool[] = [
  createCharacter,
  updateCharacter,
  deleteCharacter,
  listCharacters
]
