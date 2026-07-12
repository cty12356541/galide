/**
 * script-write-flow-tools — 控制流/分支添加(conditional/gated_choice/choice/goto/marker)
 */
import * as z from 'zod/v4'
import type { DialogueNode, GotoNode, IfNode, MarkerNode } from '../../../../shared/dsl/types.js'
import { defineTool, type RegisteredTool } from '../tool-registry.js'
import type { ToolHandlerResult } from '../types.js'
import {
  FileNameSchema,
  parseExprOrFail,
  DialogueStubSchema,
  findScene,
  sceneNotFound,
  readAst,
  writeAst,
  collectNodes,
  type MarkerNode as MarkerNodeType
} from './script-tools-shared.js'

const addConditionalBlock = defineTool({
  name: 'add_conditional_block',
  description: '向指定场景插入 [若: condition] ... [否则] ... [若终] 条件块;可选分支对白 stub。',
  risk: 'safeWrite',
  previewable: true,
  domain: 'disk',
  schema: z.object({
    fileName: FileNameSchema,
    sceneId: z.string().min(1),
    condition: z.string().min(1),
    elifConditions: z.array(z.string()).optional(),
    ifDialogue: DialogueStubSchema.optional(),
    elseDialogue: DialogueStubSchema.optional()
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await readAst(ctx, args.fileName)
    if ('error' in r) return r.error
    const scene = findScene(r.ast, args.sceneId)
    if (!scene) return sceneNotFound(args.sceneId)
    const condR = parseExprOrFail(args.condition)
    if (condR.ok === false) {
      return {
        ok: false,
        content: `条件表达式无效: ${condR.message}`,
        error: { code: 'INVALID_EXPRESSION', message: condR.message }
      }
    }
    const mkDialogue = (stub: z.infer<typeof DialogueStubSchema>): DialogueNode => ({
      type: 'dialogue',
      character: stub.character,
      lines: [stub.text],
      line: 0,
      column: 1
    })
    const branches: IfNode['branches'] = [
      {
        kind: 'if',
        condition: condR.expr,
        children: args.ifDialogue ? [mkDialogue(args.ifDialogue)] : []
      }
    ]
    if (args.elifConditions) {
      for (const elifText of args.elifConditions) {
        const elifR = parseExprOrFail(elifText)
        if (elifR.ok === false) {
          return {
            ok: false,
            content: `否则若条件无效: ${elifR.message}`,
            error: { code: 'INVALID_EXPRESSION', message: elifR.message }
          }
        }
        branches.push({ kind: 'elif', condition: elifR.expr, children: [] })
      }
    }
    branches.push({
      kind: 'else',
      children: args.elseDialogue ? [mkDialogue(args.elseDialogue)] : []
    })
    const ifNode: IfNode = { type: 'if', line: 0, column: 1, branches }
    scene.children.push(ifNode)
    await writeAst(ctx, args.fileName, r.ast)
    return { ok: true, content: `已在场景 "${args.sceneId}" 插入条件块` }
  }
})

const addGatedChoice = defineTool({
  name: 'add_gated_choice',
  description: '向指定场景追加带 [当: condition] 门控的选项行。',
  risk: 'safeWrite',
  previewable: true,
  domain: 'disk',
  schema: z.object({
    fileName: FileNameSchema,
    sceneId: z.string().min(1),
    text: z.string().min(1),
    target: z.string().min(1),
    condition: z.string().min(1)
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await readAst(ctx, args.fileName)
    if ('error' in r) return r.error
    const scene = findScene(r.ast, args.sceneId)
    if (!scene) return sceneNotFound(args.sceneId)
    const condR = parseExprOrFail(args.condition)
    if (condR.ok === false) {
      return {
        ok: false,
        content: `条件表达式无效: ${condR.message}`,
        error: { code: 'INVALID_EXPRESSION', message: condR.message }
      }
    }
    scene.children.push({
      type: 'choice',
      line: 0,
      column: 1,
      options: [{ text: args.text, target: args.target, condition: condR.expr }]
    })
    await writeAst(ctx, args.fileName, r.ast)
    return { ok: true, content: `已在场景 "${args.sceneId}" 追加门控选项 "${args.text}"` }
  }
})

const addChoice = defineTool({
  name: 'add_choice',
  description: '向指定场景追加一个选项行(可带可选 [当: condition] 门控)。target 应是已存在场景/marker。',
  risk: 'safeWrite',
  previewable: true,
  domain: 'disk',
  schema: z.object({
    fileName: FileNameSchema,
    sceneId: z.string().min(1),
    text: z.string().min(1),
    target: z.string().min(1),
    condition: z.string().optional()
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await readAst(ctx, args.fileName)
    if ('error' in r) return r.error
    const scene = findScene(r.ast, args.sceneId)
    if (!scene) return sceneNotFound(args.sceneId)
    const option = { text: args.text, target: args.target }
    if (args.condition !== undefined) {
      const condR = parseExprOrFail(args.condition)
      if (condR.ok === false) {
        return {
          ok: false,
          content: `条件表达式无效: ${condR.message}`,
          error: { code: 'INVALID_EXPRESSION', message: condR.message }
        }
      }
      scene.children.push({ type: 'choice', line: 0, column: 1, options: [{ ...option, condition: condR.expr }] })
    } else {
      scene.children.push({ type: 'choice', line: 0, column: 1, options: [option] })
    }
    await writeAst(ctx, args.fileName, r.ast)
    return { ok: true, content: `已在场景 "${args.sceneId}" 追加选项 "${args.text}" → ${args.target}` }
  }
})

const addGoto = defineTool({
  name: 'add_goto',
  description:
    '向指定场景追加一个无条件跳转行 [跳转:target]。target 应是已存在场景/marker(允许前向引用,悬空由 analyze_reachability 检测)。',
  risk: 'safeWrite',
  previewable: true,
  domain: 'disk',
  schema: z.object({
    fileName: FileNameSchema,
    sceneId: z.string().min(1),
    target: z.string().min(1)
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await readAst(ctx, args.fileName)
    if ('error' in r) return r.error
    const scene = findScene(r.ast, args.sceneId)
    if (!scene) return sceneNotFound(args.sceneId)
    const goto: GotoNode = { type: 'goto', target: args.target, line: 0, column: 1 }
    scene.children.push(goto)
    await writeAst(ctx, args.fileName, r.ast)
    return { ok: true, content: `已在场景 "${args.sceneId}" 追加跳转 → ${args.target}` }
  }
})

const addMarker = defineTool({
  name: 'add_marker',
  description: '向指定场景追加一个标记锚点(=== id ===),可作为跳转目标。id 在文件内必须唯一。',
  risk: 'safeWrite',
  previewable: true,
  domain: 'disk',
  schema: z.object({
    fileName: FileNameSchema,
    sceneId: z.string().min(1),
    id: z.string().min(1)
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await readAst(ctx, args.fileName)
    if ('error' in r) return r.error
    const scene = findScene(r.ast, args.sceneId)
    if (!scene) return sceneNotFound(args.sceneId)
    const dup = collectNodes(
      r.ast,
      (n): n is MarkerNodeType => n.type === 'marker' && n.id === args.id
    )
    if (dup.length > 0) {
      return {
        ok: false,
        content: `标记 "${args.id}" 已存在`,
        error: { code: 'DUPLICATE_MARKER', message: `marker ${args.id} already exists` }
      }
    }
    const marker: MarkerNode = { type: 'marker', id: args.id, line: 0, column: 1 }
    scene.children.push(marker)
    await writeAst(ctx, args.fileName, r.ast)
    return { ok: true, content: `已在场景 "${args.sceneId}" 追加标记 "${args.id}"` }
  }
})

export const scriptWriteFlowTools: readonly RegisteredTool[] = [
  addConditionalBlock,
  addGatedChoice,
  addChoice,
  addGoto,
  addMarker
]
