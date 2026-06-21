/**
 * command-tools — 把 CommandId 暴露为 agent 工具(renderer 域)
 */
import * as z from 'zod/v4'
import { defineTool, type RegisteredTool } from '../tool-registry.js'
import type { ToolHandlerResult } from '../types.js'

const COMMAND_IDS = [
  'commandPalette',
  'goToFile',
  'openPreferences',
  'newScriptFile',
  'newProject',
  'openProject',
  'closeProject',
  'commit',
  'export',
  'toggleLeftPanel',
  'showGit',
  'showOutline',
  'showCharacter',
  'showAi',
  'toggleAi',
  'togglePreview',
  'undo',
  'redo'
] as const

const dispatchCommand = defineTool({
  name: 'dispatch_command',
  description: '在 IDE 中执行平台命令(如打开面板、导出、Git 提交等)。',
  risk: 'destructive',
  domain: 'renderer',
  schema: z.object({
    commandId: z.enum(COMMAND_IDS)
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.dispatch) {
      return {
        ok: false,
        content: '命令投递未就绪(renderer 未连接)',
        error: { code: 'NO_DISPATCH', message: 'dispatch not available' }
      }
    }
    const r = await ctx.dispatch(args.commandId)
    if (!r.ok) {
      return {
        ok: false,
        content: `命令 ${args.commandId} 失败: ${r.error ?? 'unknown'}`,
        error: { code: 'DISPATCH_FAILED', message: r.error ?? 'dispatch failed' }
      }
    }
    return { ok: true, content: `已执行命令 ${args.commandId}` }
  }
})

export const commandTools: readonly RegisteredTool[] = [dispatchCommand]
