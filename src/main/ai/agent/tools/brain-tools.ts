/**
 * brain-tools — Project Brain 读写工具(伏笔账本 / 角色关系 / 路线知识边界)
 *
 * brain 是 canonical 数据(project-brain.json,进 Git):
 *   - brain_read 为只读;写入工具为 safeWrite + previewable,走统一确认/diff 闭环
 *   - 写入失败显式返回错误,不静默
 */
import * as z from 'zod/v4'
import {
  readBrain,
  upsertForeshadowing,
  upsertRelationship,
  upsertKnowledge
} from '../../../brain/brain-store.js'
import { defineTool, type RegisteredTool } from '../tool-registry.js'
import type { ToolHandlerResult } from '../types.js'

const writeFailure = (error: string): ToolHandlerResult => ({
  ok: false,
  content: `brain 写入失败: ${error}`,
  error: { code: 'BRAIN_WRITE_FAILED', message: error }
})

const brainReadTool = defineTool({
  name: 'brain_read',
  description:
    '读取项目大脑(project-brain.json):伏笔账本、角色关系、路线知识边界。用于写新场景前保持叙事一致。',
  risk: 'read',
  domain: 'disk',
  schema: z.object({
    kind: z.enum(['all', 'foreshadowings', 'relationships', 'knowledgeBoundaries']).optional()
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await readBrain(ctx.projectPath, ctx.fs)
    const b = r.brain
    if (args.kind === 'foreshadowings') {
      return { ok: true, content: JSON.stringify(b.foreshadowings, null, 2), data: b.foreshadowings }
    }
    if (args.kind === 'relationships') {
      return { ok: true, content: JSON.stringify(b.relationships, null, 2), data: b.relationships }
    }
    if (args.kind === 'knowledgeBoundaries') {
      return { ok: true, content: JSON.stringify(b.knowledgeBoundaries, null, 2), data: b.knowledgeBoundaries }
    }
    return { ok: true, content: JSON.stringify(b, null, 2), data: b }
  }
})

const upsertForeshadowingTool = defineTool({
  name: 'brain_upsert_foreshadowing',
  description:
    '登记或更新伏笔:埋设新伏笔(status=planted)、回收(resolved)、放弃(abandoned)。同 id 覆盖更新。',
  risk: 'safeWrite',
  previewable: true,
  domain: 'disk',
  schema: z.object({
    id: z.string().min(1),
    description: z.string().min(1),
    plantedInSceneId: z.string().min(1).optional(),
    plantedInFile: z.string().optional(),
    expectedPayoff: z.string().optional(),
    status: z.enum(['planted', 'resolved', 'abandoned'])
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await upsertForeshadowing(ctx.projectPath, args, ctx.fs)
    if (r.write && r.write.ok !== true) return writeFailure(r.write.error ?? 'unknown')
    return { ok: true, content: `伏笔 "${args.id}" 已${args.status === 'planted' ? '登记' : `标记为 ${args.status}`}`, data: r.brain.foreshadowings }
  }
})

const upsertRelationshipTool = defineTool({
  name: 'brain_upsert_relationship',
  description:
    '登记或更新两个角色的关系。按角色对定位(与顺序无关);传 description 更新现状,stages 追加阶段历史(不改写)。',
  risk: 'safeWrite',
  previewable: true,
  domain: 'disk',
  schema: z.object({
    characterA: z.string().min(1),
    characterB: z.string().min(1),
    description: z.string().min(1),
    stages: z.array(z.object({ note: z.string().min(1), at: z.string().optional() })).optional()
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await upsertRelationship(ctx.projectPath, args, ctx.fs)
    if (r.write && r.write.ok !== true) return writeFailure(r.write.error ?? 'unknown')
    return { ok: true, content: `关系 ${args.characterA}×${args.characterB} 已更新`, data: r.brain.relationships }
  }
})

const setKnowledgeTool = defineTool({
  name: 'brain_set_knowledge',
  description:
    '设置路线知识边界:在某路线/条件下,某信息是已知还是未知。用于防止分支信息泄露。',
  risk: 'safeWrite',
  previewable: true,
  domain: 'disk',
  schema: z.object({
    id: z.string().min(1).optional(),
    condition: z.string().min(1),
    fact: z.string().min(1),
    known: z.boolean(),
    note: z.string().optional()
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await upsertKnowledge(ctx.projectPath, args, ctx.fs)
    if (r.write && r.write.ok !== true) return writeFailure(r.write.error ?? 'unknown')
    return { ok: true, content: `知识边界已设置: 当 ${args.condition},「${args.fact}」${args.known ? '已知' : '未知'}`, data: r.brain.knowledgeBoundaries }
  }
})

export const brainTools: readonly RegisteredTool[] = [
  brainReadTool,
  upsertForeshadowingTool,
  upsertRelationshipTool,
  setKnowledgeTool
]
