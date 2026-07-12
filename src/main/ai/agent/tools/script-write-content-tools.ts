/**
 * script-write-content-tools — 场景内容追加(createScene/addDialogue/setVariable)
 */
import * as z from 'zod/v4'
import type { DialogueNode, SceneNode, SetNode } from '../../../../shared/dsl/types.js'
import { defineTool, type RegisteredTool } from '../tool-registry.js'
import type { ToolHandlerResult } from '../types.js'
import {
  FileNameSchema,
  SetOpSchema,
  parseExprOrFail,
  findScene,
  sceneNotFound,
  readAst,
  writeAst,
  collectNodes
} from './script-tools-shared.js'

const createScene = defineTool({
  name: 'create_scene',
  description: '在指定 .gal 末尾创建一个新场景(可设背景 / BGM)。',
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
    const ast = r.ast
    const exists = collectNodes(ast, (n): n is SceneNode => n.type === 'scene' && n.id === args.sceneId)
    if (exists.length > 0) {
      return {
        ok: false,
        content: `场景 "${args.sceneId}" 已存在`,
        error: { code: 'DUPLICATE_SCENE', message: `scene ${args.sceneId} already exists` }
      }
    }
    const scene: SceneNode = {
      type: 'scene',
      id: args.sceneId,
      line: 0,
      column: 1,
      children: [],
      ...(args.background !== undefined ? { background: args.background } : {}),
      ...(args.bgm !== undefined ? { bgm: args.bgm } : {})
    }
    ast.children.push(scene)
    await writeAst(ctx, args.fileName, ast)
    return { ok: true, content: `已创建场景 "${args.sceneId}" 于 ${args.fileName}` }
  }
})

const addDialogue = defineTool({
  name: 'add_dialogue',
  description: '向指定场景追加一条对白(角色 + 文本)。',
  risk: 'safeWrite',
  previewable: true,
  domain: 'disk',
  schema: z.object({
    fileName: FileNameSchema,
    sceneId: z.string().min(1),
    character: z.string().min(1),
    text: z.string().min(1)
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await readAst(ctx, args.fileName)
    if ('error' in r) return r.error
    const ast = r.ast
    const scene = findScene(ast, args.sceneId)
    if (!scene) return sceneNotFound(args.sceneId)
    const dialogue: DialogueNode = {
      type: 'dialogue',
      character: args.character,
      line: 0,
      column: 1,
      lines: [args.text]
    }
    scene.children.push(dialogue)
    await writeAst(ctx, args.fileName, ast)
    return { ok: true, content: `已在场景 "${args.sceneId}" 追加 ${args.character} 的对白` }
  }
})

const setVariable = defineTool({
  name: 'set_variable',
  description: '向指定场景追加一条设变量行(设: name = value | += | -=)。',
  risk: 'safeWrite',
  previewable: true,
  domain: 'disk',
  schema: z.object({
    fileName: FileNameSchema,
    sceneId: z.string().min(1),
    name: z.string().min(1),
    op: SetOpSchema,
    value: z.string().min(1)
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await readAst(ctx, args.fileName)
    if ('error' in r) return r.error
    const scene = findScene(r.ast, args.sceneId)
    if (!scene) return sceneNotFound(args.sceneId)
    const exprR = parseExprOrFail(args.value)
    if (exprR.ok === false) {
      return {
        ok: false,
        content: `值表达式无效: ${exprR.message}`,
        error: { code: 'INVALID_EXPRESSION', message: exprR.message }
      }
    }
    const setNode: SetNode = {
      type: 'set',
      name: args.name,
      op: args.op,
      value: exprR.expr,
      line: 0,
      column: 1
    }
    scene.children.push(setNode)
    await writeAst(ctx, args.fileName, r.ast)
    return { ok: true, content: `已在场景 "${args.sceneId}" 追加 设: ${args.name}` }
  }
})

export const scriptWriteContentTools: readonly RegisteredTool[] = [
  createScene,
  addDialogue,
  setVariable
]
