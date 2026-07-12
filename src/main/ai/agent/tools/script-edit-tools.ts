/**
 * script-edit-tools — 剧本编辑/删除/重排工具(update/delete/move)
 */
import * as z from 'zod/v4'
import type { DialogueNode } from '../../../../shared/dsl/types.js'
import { defineTool, type RegisteredTool } from '../tool-registry.js'
import type { ToolHandlerResult } from '../types.js'
import {
  FileNameSchema,
  findScene,
  sceneNotFound,
  readAst,
  writeAst
} from './script-tools-shared.js'

const updateDialogue = defineTool({
  name: 'update_dialogue',
  description: '修改指定场景内第 N 条对白(0 基)的角色 / 文本。用于修订已有台词而非新增。',
  risk: 'safeWrite',
  previewable: true,
  domain: 'disk',
  schema: z.object({
    fileName: FileNameSchema,
    sceneId: z.string().min(1),
    index: z.number().int().min(0),
    character: z.string().optional(),
    text: z.string().min(1)
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await readAst(ctx, args.fileName)
    if ('error' in r) return r.error
    const scene = findScene(r.ast, args.sceneId)
    if (!scene) return sceneNotFound(args.sceneId)
    const dialogues = scene.children.filter((c): c is DialogueNode => c.type === 'dialogue')
    const target = dialogues[args.index]
    if (!target) {
      return {
        ok: false,
        content: `场景 "${args.sceneId}" 没有第 ${args.index} 条对白(共 ${dialogues.length} 条)`,
        error: { code: 'INDEX_OUT_OF_RANGE', message: `dialogue index ${args.index} not found` }
      }
    }
    if (args.character !== undefined) target.character = args.character
    target.lines = [args.text]
    await writeAst(ctx, args.fileName, r.ast)
    return { ok: true, content: `已更新场景 "${args.sceneId}" 第 ${args.index} 条对白` }
  }
})

const updateSceneMeta = defineTool({
  name: 'update_scene_meta',
  description: '修改场景的背景 / BGM(传空串清除)。sceneId 不可改(改 id 会断开跳转目标)。',
  risk: 'safeWrite',
  previewable: true,
  domain: 'disk',
  schema: z.object({
    fileName: FileNameSchema,
    sceneId: z.string().min(1),
    background: z.string().optional(),
    bgm: z.string().optional()
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await readAst(ctx, args.fileName)
    if ('error' in r) return r.error
    const scene = findScene(r.ast, args.sceneId)
    if (!scene) return sceneNotFound(args.sceneId)
    if (args.background !== undefined) {
      if (args.background === '') delete scene.background
      else scene.background = args.background
    }
    if (args.bgm !== undefined) {
      if (args.bgm === '') delete scene.bgm
      else scene.bgm = args.bgm
    }
    await writeAst(ctx, args.fileName, r.ast)
    return { ok: true, content: `已更新场景 "${args.sceneId}" 元信息` }
  }
})

const deleteNode = defineTool({
  name: 'delete_node',
  description: '从场景内删除第 N 个子节点(0 基)。可删对白/选项/设变量/条件块/goto/marker。',
  risk: 'safeWrite',
  previewable: true,
  domain: 'disk',
  schema: z.object({
    fileName: FileNameSchema,
    sceneId: z.string().min(1),
    index: z.number().int().min(0)
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await readAst(ctx, args.fileName)
    if ('error' in r) return r.error
    const scene = findScene(r.ast, args.sceneId)
    if (!scene) return sceneNotFound(args.sceneId)
    if (args.index >= scene.children.length) {
      return {
        ok: false,
        content: `场景 "${args.sceneId}" 没有第 ${args.index} 个子节点(共 ${scene.children.length} 个)`,
        error: { code: 'INDEX_OUT_OF_RANGE', message: `child index ${args.index} out of range` }
      }
    }
    const removed = scene.children.splice(args.index, 1)[0]!
    await writeAst(ctx, args.fileName, r.ast)
    return { ok: true, content: `已删除场景 "${args.sceneId}" 第 ${args.index} 个节点(${removed.type})` }
  }
})

const moveNode = defineTool({
  name: 'move_node',
  description: '在场景内把第 N 个子节点移动到新位置(0 基)。用于重排台词顺序。',
  risk: 'safeWrite',
  previewable: true,
  domain: 'disk',
  schema: z.object({
    fileName: FileNameSchema,
    sceneId: z.string().min(1),
    from: z.number().int().min(0),
    to: z.number().int().min(0)
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await readAst(ctx, args.fileName)
    if ('error' in r) return r.error
    const scene = findScene(r.ast, args.sceneId)
    if (!scene) return sceneNotFound(args.sceneId)
    const children = scene.children
    if (args.from >= children.length || args.to >= children.length) {
      return {
        ok: false,
        content: `索引越界:from=${args.from} to=${args.to}(共 ${children.length} 个节点)`,
        error: { code: 'INDEX_OUT_OF_RANGE', message: 'move index out of range' }
      }
    }
    const [moved] = children.splice(args.from, 1)
    children.splice(args.to, 0, moved!)
    await writeAst(ctx, args.fileName, r.ast)
    return { ok: true, content: `已移动节点 ${args.from} → ${args.to} 于场景 "${args.sceneId}"` }
  }
})

export const scriptEditTools: readonly RegisteredTool[] = [
  updateDialogue,
  updateSceneMeta,
  deleteNode,
  moveNode
]
