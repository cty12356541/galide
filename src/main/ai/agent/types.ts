/**
 * agent 层共享类型 — provider 无关的工具协议
 *
 * 设计:
 *   - 工具带 risk(read/safeWrite/destructive)与 domain(disk=main 直接跑 /
 *     renderer=经 agent:dispatchCommand 投递 CommandId)
 *   - provider adapter 把原生 tool_calls/tool_use 归一为内部 ToolCall/ToolResult
 *   - 循环主体只认这套内部协议,不感知具体 provider
 */

export type ToolRisk = 'read' | 'safeWrite' | 'destructive'

export type ToolDomain = 'disk' | 'renderer'

/** provider 归一后的工具调用 */
export interface ToolCall {
  /** provider 给的调用 id(用于把 result 对回 call) */
  id: string
  name: string
  /** LLM 产出的原始入参(未校验的 JSON) */
  args: unknown
}

/** 工具执行结果(回灌给 LLM 的 observation) */
export interface ToolResult {
  id: string
  name: string
  ok: boolean
  /** 给 LLM 看的文本 observation */
  content: string
  data?: unknown
  error?: { code: string; message: string }
}

/** 工具操作磁盘的最小 fs 接口(测试用 memfs 注入) */
export interface ToolFs {
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  readdir: (path: string) => Promise<string[]>
}

/** renderer 域工具的命令投递(Phase 4 经 agent:dispatchCommand) */
export type ToolDispatch = (
  commandId: string,
  payload?: unknown
) => Promise<{ ok: boolean; error?: string }>

export interface ToolContext {
  projectPath: string
  fs: ToolFs
  dispatch?: ToolDispatch
}

/** 工具 handler 的返回(registry 再包成 ToolResult) */
export interface ToolHandlerResult {
  ok: boolean
  content: string
  data?: unknown
  error?: { code: string; message: string }
}
