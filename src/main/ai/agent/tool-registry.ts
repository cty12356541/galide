/**
 * tool-registry — 工具注册表(schema 校验 + risk/domain + handler)
 *
 * - 每个工具用 zod schema 声明入参;execute 时先 safeParse,失败返回 SCHEMA_FAILED
 *   (复用 IPC 边界的 SCHEMA_FAILED 语义,见 ipc/schemas/index.ts)
 * - defineTool 把强类型工具擦除为可异构存储的 RegisteredTool
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
}

/** 类型擦除后的可存储工具 */
export interface RegisteredTool {
  name: string
  description: string
  risk: ToolRisk
  domain: ToolDomain
  jsonSchema: () => Record<string, unknown>
  run: (rawArgs: unknown, ctx: ToolContext) => Promise<ToolHandlerResult>
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
  toJsonSchemas: () => ToolJsonSchema[]
}

const issuesToMessage = (issues: z.core.$ZodIssue[]): string =>
  issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')

/** 把强类型工具擦除为 RegisteredTool(校验逻辑内联) */
export const defineTool = <TArgs>(def: ToolDefinition<TArgs>): RegisteredTool => ({
  name: def.name,
  description: def.description,
  risk: def.risk,
  domain: def.domain,
  jsonSchema: () => z.toJSONSchema(def.schema) as Record<string, unknown>,
  run: async (rawArgs, ctx) => {
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
})

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
    toJsonSchemas: () =>
      [...map.values()].map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.jsonSchema()
      }))
  }
}
