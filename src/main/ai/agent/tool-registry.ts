/**
 * tool-registry — 工具注册表(schema 校验 + risk/domain + handler + 可选 preview)
 *
 * - 每个工具用 zod schema 声明入参;execute 时先 safeParse,失败返回 SCHEMA_FAILED
 *   (复用 IPC 边界的 SCHEMA_FAILED 语义,见 ipc/schemas/index.ts)
 * - defineTool 把强类型工具擦除为可异构存储的 RegisteredTool
 * - previewable 工具额外提供 preview:在 overlay fs 上重放 mutate 产出 before/after,
 *   供 agent-loop 在确认前展示 diff。preview 独立于 run —— 拒绝执行时 handler 不被调用。
 * - toJsonSchemas 供 provider adapter 广告工具(openai tools / claude tools)
 */
import * as z from 'zod/v4'
import type {
  ToolCall,
  ToolContext,
  ToolDomain,
  ToolHandlerResult,
  ToolResult,
  ToolRisk
} from './types.js'

export type { ToolContext, ToolHandlerResult, ToolCall, ToolResult, ToolRisk, ToolDomain } from './types.js'

/** 强类型工具定义(defineTool 的入参) */
export interface ToolDefinition<TArgs> {
  name: string
  description: string
  risk: ToolRisk
  domain: ToolDomain
  schema: z.ZodType<TArgs>
  handler: (args: TArgs, ctx: ToolContext) => Promise<ToolHandlerResult>
  /** 标记后自动生成 preview(在 overlay fs 上重放 handler,产出 before/after diff) */
  previewable?: boolean
}

/** 类型擦除后的可存储工具 */
export interface RegisteredTool {
  name: string
  description: string
  risk: ToolRisk
  domain: ToolDomain
  jsonSchema: () => Record<string, unknown>
  run: (rawArgs: unknown, ctx: ToolContext) => Promise<ToolHandlerResult>
  /** 确认前的前后预览(无则 undefined → loop 跳过 diff) */
  preview?: (rawArgs: unknown, ctx: ToolContext) => Promise<ToolPreview | null>
}

/** 确认前的前后预览(给 requestConfirm 的 diff 用) */
export interface ToolPreview {
  before: string
  after: string
}

/** 供 provider 广告工具的 JSON 形态 */
export interface ToolJsonSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolRegistry {
  register: (tool: RegisteredTool) => void
  get: (name: string) => RegisteredTool | undefined
  list: () => RegisteredTool[]
  execute: (call: ToolCall, ctx: ToolContext) => Promise<ToolResult>
  /** 取确认前的前后预览(无 preview 的工具返回 null) */
  preview: (call: ToolCall, ctx: ToolContext) => Promise<ToolPreview | null>
  toJsonSchemas: () => ToolJsonSchema[]
}

const issuesToMessage = (issues: z.core.$ZodIssue[]): string =>
  issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')

/**
 * 在 overlay fs 上重放工具 handler,捕获其写盘结果(不落真盘),
 * 与真实盘内容做 before/after diff。仅适用于幂等的磁盘写工具(如 .gal 编辑)。
 * handler 失败 / 无写盘 → 返回 null(确认时不展示 diff)。
 */
const overlayPreview = async (
  run: RegisteredTool['run'],
  rawArgs: unknown,
  ctx: ToolContext
): Promise<ToolPreview | null> => {
  const staged = new Map<string, string>()
  const overlayCtx: ToolContext = {
    projectPath: ctx.projectPath,
    dispatch: ctx.dispatch,
    fs: {
      readFile: async (p) => (staged.has(p) ? (staged.get(p) as string) : ctx.fs.readFile(p)),
      writeFile: async (p, c) => {
        staged.set(p, c)
      },
      readdir: (p) => ctx.fs.readdir(p)
    }
  }
  const r = await run(rawArgs, overlayCtx)
  if (!r.ok) return null
  for (const [path, after] of staged) {
    let before = ''
    try {
      before = await ctx.fs.readFile(path)
    } catch {
      // 新建文件:before 为空
    }
    return { before, after }
  }
  return null
}

/** 把强类型工具擦除为 RegisteredTool(校验逻辑内联) */
export const defineTool = <TArgs>(def: ToolDefinition<TArgs>): RegisteredTool => {
  const run = async (rawArgs: unknown, ctx: ToolContext): Promise<ToolHandlerResult> => {
    const parsed = def.schema.safeParse(rawArgs)
    if (!parsed.success) {
      return {
        ok: false,
        content: `工具 ${def.name} 入参校验失败: ${issuesToMessage(parsed.error.issues)}`,
        error: { code: 'SCHEMA_FAILED', message: issuesToMessage(parsed.error.issues) }
      }
    }
    return def.handler(parsed.data, ctx)
  }
  return {
    name: def.name,
    description: def.description,
    risk: def.risk,
    domain: def.domain,
    jsonSchema: () => z.toJSONSchema(def.schema) as Record<string, unknown>,
    run,
    preview: def.previewable ? (rawArgs, ctx) => overlayPreview(run, rawArgs, ctx) : undefined
  }
}

export const createToolRegistry = (tools: readonly RegisteredTool[] = []): ToolRegistry => {
  const map = new Map<string, RegisteredTool>()
  for (const t of tools) map.set(t.name, t)

  return {
    register: (tool) => {
      map.set(tool.name, tool)
    },
    get: (name) => map.get(name),
    list: () => [...map.values()],
    execute: async (call, ctx) => {
      const tool = map.get(call.name)
      if (!tool) {
        return {
          id: call.id,
          name: call.name,
          ok: false,
          content: `未知工具 ${call.name}`,
          error: { code: 'UNKNOWN_TOOL', message: `tool not registered: ${call.name}` }
        }
      }
      const r = await tool.run(call.args, ctx)
      return {
        id: call.id,
        name: call.name,
        ok: r.ok,
        content: r.content,
        data: r.data,
        error: r.error
      }
    },
    preview: async (call, ctx) => {
      const tool = map.get(call.name)
      if (!tool?.preview) return null
      try {
        return await tool.preview(call.args, ctx)
      } catch {
        return null
      }
    },
    toJsonSchemas: () =>
      [...map.values()].map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.jsonSchema()
      }))
  }
}
