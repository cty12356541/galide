/**
 * analysis-tools — 决策树可达性 / 死路检测(纯函数 walkScript)
 */
import { galScriptAbs, isGalScriptFileName, scriptsDirAbs } from '../../../../shared/project-layout.js'
import * as z from 'zod/v4'
import { parse } from '../../../../shared/dsl/parser.js'
import { mergeScriptAsts } from '../../../../shared/dsl/merge-scripts.js'
import { analyzeReachability } from '../decision-tree.js'
import { defineTool, type RegisteredTool } from '../tool-registry.js'
import type { ToolHandlerResult } from '../types.js'
import type { ScriptNode } from '../../../../shared/dsl/types.js'

const FileNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+\.gal$/, 'fileName 必须形如 chapter1.gal')

/** 单文件或全项目(省略 fileName)解析;全项目合并 AST,跨文件跳转可见 */
const loadAst = async (
  projectPath: string,
  fs: { readdir: (p: string) => Promise<string[]>; readFile: (p: string) => Promise<string> },
  fileName?: string
): Promise<{ ok: true; ast: ScriptNode } | { ok: false; message: string }> => {
  if (fileName) {
    let src: string
    try {
      src = await fs.readFile(galScriptAbs(projectPath, fileName))
    } catch (e) {
      return { ok: false, message: `读取 ${fileName} 失败: ${e instanceof Error ? e.message : String(e)}` }
    }
    const parsed = parse(src)
    if (!parsed.ok) return { ok: false, message: `${fileName} 解析失败` }
    return { ok: true, ast: parsed.value }
  }
  let files: string[]
  try {
    files = (await fs.readdir(scriptsDirAbs(projectPath))).filter((f) => isGalScriptFileName(f)).sort()
  } catch (e) {
    return { ok: false, message: `读取 scripts/ 失败: ${e instanceof Error ? e.message : String(e)}` }
  }
  if (files.length === 0) return { ok: false, message: '项目中没有 scripts/*.gal 剧本文件' }
  const asts: Array<{ file: string; ast: ScriptNode }> = []
  for (const file of files) {
    const parsed = parse(await fs.readFile(galScriptAbs(projectPath, file)))
    if (!parsed.ok) return { ok: false, message: `${file} 解析失败` }
    asts.push({ file, ast: parsed.value })
  }
  return { ok: true, ast: mergeScriptAsts(asts) }
}

const formatReport = (report: ReturnType<typeof analyzeReachability>): string => {
  const lines = [
    `入口: ${report.entry ?? '(无)'}`,
    `可达(${report.reachable.length}): ${report.reachable.join(', ') || '(无)'}`,
    `不可达(${report.unreachable.length}): ${report.unreachable.join(', ') || '(无)'}`,
    `悬空跳转(${report.danglingTargets.length}): ${report.danglingTargets.map((d) => `${d.from}→${d.target}`).join(', ') || '(无)'}`
  ]
  return lines.join('\n')
}

const analyzeReachabilityTool = defineTool({
  name: 'analyze_reachability',
  description:
    '分析剧本可达性:不可达节点、悬空跳转目标。省略 fileName 时分析全项目(合并所有 .gal,跨文件跳转可见)。',
  risk: 'read',
  domain: 'disk',
  schema: z.object({ fileName: FileNameSchema.optional() }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const loaded = await loadAst(ctx.projectPath, ctx.fs, args.fileName)
    if (!loaded.ok) {
      return {
        ok: false,
        content: loaded.message,
        error: { code: args.fileName ? 'PARSE_FAILED' : 'PROJECT_PARSE_FAILED', message: loaded.message }
      }
    }
    const report = analyzeReachability(loaded.ast)
    const scope = args.fileName ?? '全项目(merged)'
    return { ok: true, content: `[${scope}]\n${formatReport(report)}`, data: report }
  }
})

export const analysisTools: readonly RegisteredTool[] = [analyzeReachabilityTool]
