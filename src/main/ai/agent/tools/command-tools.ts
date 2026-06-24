/**
 * command-tools — 把 CommandId 暴露为 agent 工具(renderer 域)
 *
 * 按副作用拆两档风险:
 *   - navigate(read):面板切换 / 导航 / 偏好 — 只改视图,不动数据 → hybrid 下自动放行
 *   - dispatch_command(destructive):新建 / 打开项目 / 提交 / 导出 / 撤销重做 — 改状态 → 需确认
 */
import * as z from 'zod/v4'
import { defineTool, type RegisteredTool } from '../tool-registry.js'
import type { ToolContext, ToolHandlerResult } from '../types.js'

/** 只读视图命令(切换面板 / 导航 / 打开偏好),无数据写入 */
const NAVIGATE_COMMAND_IDS = [
  'commandPalette',
  'goToFile',
  'openPreferences',
  'toggleLeftPanel',
  'showGit',
  'showOutline',
  'showCharacter',
  'showAi',
  'toggleAi',
  'togglePreview'
] as const

/** 改变项目 / 编辑器状态的命令(新建 / 打开项目 / 提交 / 导出 / 撤销重做) */
const STATE_COMMAND_IDS = [
  'newScriptFile',
  'newProject',
  'openProject',
  'closeProject',
  'commit',
  'export',
  'undo',
  'redo'
] as const

const runDispatch = async (
  commandId: string,
  ctx: ToolContext
): Promise<ToolHandlerResult> => {
  if (!ctx.dispatch) {
    return {
      ok: false,
      content: '命令投递未就绪(renderer 未连接)',
      error: { code: 'NO_DISPATCH', message: 'dispatch not available' }
    }
  }
  const r = await ctx.dispatch(commandId)
  if (!r.ok) {
    return {
      ok: false,
      content: `命令 ${commandId} 失败: ${r.error ?? 'unknown'}`,
      error: { code: 'DISPATCH_FAILED', message: r.error ?? 'dispatch failed' }
    }
  }
  return { ok: true, content: `已执行命令 ${commandId}` }
}

const navigate = defineTool({
  name: 'navigate',
  description: '执行只读视图命令(切换面板 / 跳转文件 / 打开偏好),不改数据。',
  risk: 'read',
  domain: 'renderer',
  schema: z.object({ commandId: z.enum(NAVIGATE_COMMAND_IDS) }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => runDispatch(args.commandId, ctx)
})

const dispatchCommand = defineTool({
  name: 'dispatch_command',
  description: '执行改变项目状态的命令(新建剧本/项目、打开/关闭项目、Git 提交、导出、撤销重做)。',
  risk: 'destructive',
  domain: 'renderer',
  schema: z.object({ commandId: z.enum(STATE_COMMAND_IDS) }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => runDispatch(args.commandId, ctx)
})

export const commandTools: readonly RegisteredTool[] = [navigate, dispatchCommand]
