/**
 * script-tools — 剧本/决策树工具(只读 + 安全写)
 *
 * 全部操作磁盘上的 .gal(canonical),写盘后由 agent-loop / IPC 层广播 script:changed
 * 让 renderer 自动重载。安全写工具走 parse → mutate AST → serialize 往返,保证语义稳定。
 *
 * 规约:core/conventions.yaml「.gal 是 canonical」「资产相对路径」;DSL 遍历走 visitor。
 */
import { join } from 'node:path'
import * as z from 'zod/v4'
import { parse, collectSceneSummaries } from '../../../../shared/dsl/parser.js'
import { serialize } from '../../../../shared/dsl/serializer.js'
import { findById, collectNodes } from '../../../../shared/dsl/visitor.js'
import { parseExpression, type Expression } from '../../../../shared/dsl/expression.js'
import { scanScriptVariables } from '../../../../shared/dsl/scan-variables.js'
import type { DialogueNode, IfNode, SceneNode, ScriptNode, SetNode } from '../../../../shared/dsl/types.js'
import { defineTool, type RegisteredTool } from '../tool-registry.js'
import type { ToolContext, ToolHandlerResult } from '../types.js'

const FileNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+\.gal$/, 'fileName 必须形如 chapter1.gal(禁止路径穿越)')

const MAX_READ_CHARS = 8000

const readAst = async (
  ctx: ToolContext,
  fileName: string
): Promise<{ ast: ScriptNode } | { error: ToolHandlerResult }> => {
  let src = ''
  try {
    src = await ctx.fs.readFile(join(ctx.projectPath, fileName))
  } catch (e) {
    return {
      error: {
        ok: false,
        content: `读取 ${fileName} 失败`,
        error: { code: 'READ_FAILED', message: e instanceof Error ? e.message : String(e) }
      }
    }
  }
  const result = parse(src)
  if (result.ok === true) {
    return { ast: result.value }
  }
  const message = result.error.map((e) => e.message).join('; ')
  return {
    error: {
      ok: false,
      content: `${fileName} 解析失败(存在 error 级诊断),无法安全编辑`,
      error: { code: 'PARSE_FAILED', message }
    }
  }
}

const writeAst = async (ctx: ToolContext, fileName: string, ast: ScriptNode): Promise<void> => {
  await ctx.fs.writeFile(join(ctx.projectPath, fileName), serialize(ast))
}

// ----------------------------------------------------------------------------
// 只读
// ----------------------------------------------------------------------------

const listScenes = defineTool({
  name: 'list_scenes',
  description: '列出项目中所有场景(可选限定某个 .gal 文件),返回场景 id / 来源文件 / 背景。',
  risk: 'read',
  domain: 'disk',
  schema: z.object({ fileName: FileNameSchema.optional() }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    let files: string[] = []
    if (args.fileName) {
      files = [args.fileName]
    } else {
      try {
        files = (await ctx.fs.readdir(ctx.projectPath)).filter((f) => f.endsWith('.gal')).sort()
      } catch {
        files = []
      }
    }
    const summaries: string[] = []
    for (const file of files) {
      const r = await readAst(ctx, file)
      if ('error' in r) continue
      for (const s of collectSceneSummaries(r.ast, file)) {
        summaries.push(`- ${s.id} [${s.fileName}] 背景=${s.background ?? '-'} BGM=${s.bgm ?? '-'}`)
      }
    }
    return {
      ok: true,
      content: summaries.length > 0 ? summaries.join('\n') : '(无场景)',
      data: { count: summaries.length }
    }
  }
})

const readScript = defineTool({
  name: 'read_script',
  description: '读取一个 .gal 剧本文件的源文本(过长会截断)。',
  risk: 'read',
  domain: 'disk',
  schema: z.object({ fileName: FileNameSchema }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    try {
      const src = await ctx.fs.readFile(join(ctx.projectPath, args.fileName))
      const truncated = src.length > MAX_READ_CHARS
      return {
        ok: true,
        content: truncated ? src.slice(0, MAX_READ_CHARS) + '\n…(已截断)' : src,
        data: { length: src.length, truncated }
      }
    } catch (e) {
      return {
        ok: false,
        content: `读取 ${args.fileName} 失败`,
        error: { code: 'READ_FAILED', message: e instanceof Error ? e.message : String(e) }
      }
    }
  }
})

const findNode = defineTool({
  name: 'find_node',
  description: '在指定 .gal 中按 id 查找场景或标记节点,返回其位置。',
  risk: 'read',
  domain: 'disk',
  schema: z.object({ fileName: FileNameSchema, id: z.string().min(1) }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await readAst(ctx, args.fileName)
    if ('error' in r) return r.error
    const node = findById(r.ast, args.id)
    if (!node) {
      return {
        ok: false,
        content: `未在 ${args.fileName} 中找到 id="${args.id}" 的节点`,
        error: { code: 'NOT_FOUND', message: `node id ${args.id} not found` }
      }
    }
    return {
      ok: true,
      content: `找到节点 type=${node.type} id=${args.id} 位于 ${args.fileName} L${node.line}`,
      data: { type: node.type, line: node.line, column: node.column }
    }
  }
})

// ----------------------------------------------------------------------------
// 安全写
// ----------------------------------------------------------------------------

const createScene = defineTool({
  name: 'create_scene',
  description: '在指定 .gal 末尾创建一个新场景(可设背景 / BGM)。',
  risk: 'safeWrite',
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
    const scene = findById(ast, args.sceneId)
    if (!scene || scene.type !== 'scene') {
      return {
        ok: false,
        content: `场景 "${args.sceneId}" 不存在,无法追加对白`,
        error: { code: 'SCENE_NOT_FOUND', message: `scene ${args.sceneId} not found` }
      }
    }
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

const SetOpSchema = z.enum(['set', 'add', 'sub'])

const parseExprOrFail = (text: string): { ok: true; expr: Expression } | { ok: false; message: string } => {
  const parsed = parseExpression(text)
  if (!parsed.ok) return { ok: false, message: parsed.error.message }
  if (parsed.rest.trim().length > 0) return { ok: false, message: `表达式尾部有多余内容: ${parsed.rest}` }
  return { ok: true, expr: parsed.expr }
}

const setVariable = defineTool({
  name: 'set_variable',
  description: '向指定场景追加一条设变量行(设: name = value | += | -=)。',
  risk: 'safeWrite',
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
    const scene = findById(r.ast, args.sceneId)
    if (!scene || scene.type !== 'scene') {
      return {
        ok: false,
        content: `场景 "${args.sceneId}" 不存在`,
        error: { code: 'SCENE_NOT_FOUND', message: `scene ${args.sceneId} not found` }
      }
    }
    const exprR = parseExprOrFail(args.value)
    if (!exprR.ok) {
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

const DialogueStubSchema = z.object({
  character: z.string().min(1),
  text: z.string().min(1)
})

const addConditionalBlock = defineTool({
  name: 'add_conditional_block',
  description: '向指定场景插入 [若: condition] ... [否则] ... [若终] 条件块;可选分支对白 stub。',
  risk: 'safeWrite',
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
    const scene = findById(r.ast, args.sceneId)
    if (!scene || scene.type !== 'scene') {
      return {
        ok: false,
        content: `场景 "${args.sceneId}" 不存在`,
        error: { code: 'SCENE_NOT_FOUND', message: `scene ${args.sceneId} not found` }
      }
    }
    const condR = parseExprOrFail(args.condition)
    if (!condR.ok) {
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
        if (!elifR.ok) {
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
    const scene = findById(r.ast, args.sceneId)
    if (!scene || scene.type !== 'scene') {
      return {
        ok: false,
        content: `场景 "${args.sceneId}" 不存在`,
        error: { code: 'SCENE_NOT_FOUND', message: `scene ${args.sceneId} not found` }
      }
    }
    const condR = parseExprOrFail(args.condition)
    if (!condR.ok) {
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

const readVariables = defineTool({
  name: 'read_variables',
  description: '扫描 .gal 中所有 SetNode 变量名、门控选项 [当:] 条件、if 分支条件。',
  risk: 'read',
  domain: 'disk',
  schema: z.object({ fileName: FileNameSchema }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const r = await readAst(ctx, args.fileName)
    if ('error' in r) return r.error
    const scan = scanScriptVariables(r.ast)
    const lines: string[] = []
    if (scan.setVariables.length > 0) {
      lines.push(`设变量: ${scan.setVariables.join(', ')}`)
    } else {
      lines.push('设变量: (无)')
    }
    if (scan.gatedChoices.length > 0) {
      lines.push('门控选项:')
      for (const g of scan.gatedChoices) {
        lines.push(`  - "${g.text}" → ${g.target} [当: ${g.condition}]`)
      }
    }
    if (scan.conditionalBranches.length > 0) {
      lines.push('条件分支:')
      for (const b of scan.conditionalBranches) {
        lines.push(`  - [${b.kind}] ${b.condition} (场景 ${b.sceneId})`)
      }
    }
    return {
      ok: true,
      content: lines.join('\n'),
      data: scan
    }
  }
})

/** 剧本相关工具集合(注册进 tool-registry) */
export const scriptTools: readonly RegisteredTool[] = [
  listScenes,
  readScript,
  findNode,
  createScene,
  addDialogue,
  setVariable,
  addConditionalBlock,
  addGatedChoice,
  readVariables
]
