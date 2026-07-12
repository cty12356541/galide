/**
 * script-tools-shared — 剧本工具共用 helper(readAst/writeAst/schema/parseExpr)
 *
 * 全部操作磁盘上的 .gal(canonical),写盘后由 agent-loop / IPC 层广播 script:changed
 * 让 renderer 自动重载。安全写工具走 parse → mutate AST → serialize 往返,保证语义稳定。
 *
 * 规约:core/conventions.yaml「.gal 是 canonical」「资产相对路径」;DSL 遍历走 visitor。
 */
import * as z from 'zod/v4'
import {
  galScriptAbs,
  isGalScriptFileName,
  scriptsDirAbs
} from '../../../../shared/project-layout.js'
import { parse } from '../../../../shared/dsl/parser.js'
import { serialize } from '../../../../shared/dsl/serializer.js'
import { findById, collectNodes } from '../../../../shared/dsl/visitor.js'
import { parseExpression, type Expression } from '../../../../shared/dsl/expression.js'
import type {
  MarkerNode,
  SceneNode,
  ScriptNode
} from '../../../../shared/dsl/types.js'
import type { ToolContext, ToolHandlerResult } from '../types.js'

export const FileNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+\.gal$/, 'fileName 必须形如 chapter1.gal(禁止路径穿越)')

export const MAX_READ_CHARS = 8000

export const readAst = async (
  ctx: ToolContext,
  fileName: string
): Promise<{ ast: ScriptNode } | { error: ToolHandlerResult }> => {
  let src = ''
  try {
    src = await ctx.fs.readFile(galScriptAbs(ctx.projectPath, fileName))
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

export const writeAst = async (ctx: ToolContext, fileName: string, ast: ScriptNode): Promise<void> => {
  await ctx.fs.writeFile(galScriptAbs(ctx.projectPath, fileName), serialize(ast))
}

export const SetOpSchema = z.enum(['set', 'add', 'sub'])

export const parseExprOrFail = (
  text: string
): { ok: true; expr: Expression } | { ok: false; message: string } => {
  const parsed = parseExpression(text)
  if (parsed.ok === false) return { ok: false, message: parsed.error.message }
  if (parsed.rest.trim().length > 0) return { ok: false, message: `表达式尾部有多余内容: ${parsed.rest}` }
  return { ok: true, expr: parsed.expr }
}

export const DialogueStubSchema = z.object({
  character: z.string().min(1),
  text: z.string().min(1)
})

/** 在已解析 AST 上按 id 定位场景 */
export const findScene = (ast: ScriptNode, sceneId: string): SceneNode | null => {
  const node = findById(ast, sceneId)
  return node && node.type === 'scene' ? node : null
}

export const sceneNotFound = (sceneId: string): ToolHandlerResult => ({
  ok: false,
  content: `场景 "${sceneId}" 不存在`,
  error: { code: 'SCENE_NOT_FOUND', message: `scene ${sceneId} not found` }
})

export { scriptsDirAbs, isGalScriptFileName }
export { collectNodes }
export type { MarkerNode, SceneNode }
