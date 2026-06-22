/**
 * analysis-tools — 决策树可达性 / 死路检测(纯函数 walkScript)
 */
import { galScriptAbs } from '../../../../shared/project-layout.js'
import * as z from 'zod/v4'
import { parse } from '../../../../shared/dsl/parser.js'
import { analyzeReachability } from '../decision-tree.js'
import { defineTool, type RegisteredTool } from '../tool-registry.js'
import type { ToolHandlerResult } from '../types.js'

const FileNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+\.gal$/, 'fileName 必须形如 chapter1.gal')

const analyzeReachabilityTool = defineTool({
  name: 'analyze_reachability',
  description: '分析 .gal 剧本的可达性:不可达节点、悬空跳转目标。',
  risk: 'read',
  domain: 'disk',
  schema: z.object({ fileName: FileNameSchema }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    let src = ''
    try {
      src = await ctx.fs.readFile(galScriptAbs(ctx.projectPath, args.fileName))
    } catch (e) {
      return {
        ok: false,
        content: `读取 ${args.fileName} 失败`,
        error: { code: 'READ_FAILED', message: e instanceof Error ? e.message : String(e) }
      }
    }
    const parsed = parse(src)
    if (!parsed.ok) {
      return {
        ok: false,
        content: `${args.fileName} 解析失败`,
        error: { code: 'PARSE_FAILED', message: 'parse errors' }
      }
    }
    const report = analyzeReachability(parsed.value)
    const lines = [
      `入口: ${report.entry ?? '(无)'}`,
      `可达(${report.reachable.length}): ${report.reachable.join(', ') || '(无)'}`,
      `不可达(${report.unreachable.length}): ${report.unreachable.join(', ') || '(无)'}`,
      `悬空跳转(${report.danglingTargets.length}): ${report.danglingTargets.map((d) => `${d.from}→${d.target}`).join(', ') || '(无)'}`
    ]
    return { ok: true, content: lines.join('\n'), data: report }
  }
})

export const analysisTools: readonly RegisteredTool[] = [analyzeReachabilityTool]
