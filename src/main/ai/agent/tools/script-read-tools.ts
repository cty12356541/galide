/**
 * script-read-tools — 剧本只读工具(list/read/find/variables)
 */
import * as z from 'zod/v4'
import { galScriptAbs } from '../../../../shared/project-layout.js'
import { collectSceneSummaries } from '../../../../shared/dsl/parser.js'
import { findById } from '../../../../shared/dsl/visitor.js'
import { scanScriptVariables } from '../../../../shared/dsl/scan-variables.js'
import { defineTool, type RegisteredTool } from '../tool-registry.js'
import type { ToolHandlerResult } from '../types.js'
import {
  FileNameSchema,
  MAX_READ_CHARS,
  readAst,
  scriptsDirAbs,
  isGalScriptFileName
} from './script-tools-shared.js'

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
        files = (await ctx.fs.readdir(scriptsDirAbs(ctx.projectPath)))
          .filter((f) => isGalScriptFileName(f))
          .sort()
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

const createScriptFile = defineTool({
  name: 'create_script_file',
  description: '从零创建一个空 .gal 剧本文件(若已存在则报错,不覆盖)。用于 bootstrap 全新项目结构。',
  risk: 'safeWrite',
  previewable: true,
  domain: 'disk',
  schema: z.object({ fileName: FileNameSchema }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    try {
      await ctx.fs.readFile(galScriptAbs(ctx.projectPath, args.fileName))
      return {
        ok: false,
        content: `${args.fileName} 已存在,未覆盖`,
        error: { code: 'DUPLICATE_FILE', message: `file ${args.fileName} already exists` }
      }
    } catch {
      // 不存在 → 继续(预期路径)
    }
    await ctx.fs.writeFile(galScriptAbs(ctx.projectPath, args.fileName), '')
    return { ok: true, content: `已创建空剧本 ${args.fileName}`, data: { fileName: args.fileName } }
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
      const src = await ctx.fs.readFile(galScriptAbs(ctx.projectPath, args.fileName))
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

export const scriptReadTools: readonly RegisteredTool[] = [
  listScenes,
  createScriptFile,
  readScript,
  findNode,
  readVariables
]
