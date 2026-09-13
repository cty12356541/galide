/**
 * script-write-tools — 剧本安全写工具(create/add)
 *
 * 已拆分为 script-write-content-tools.ts / script-write-flow-tools.ts,
 * 本文件保留聚合导出以保证向后兼容。
 */
import { scriptWriteContentTools } from './script-write-content-tools.js'
import { scriptWriteFlowTools } from './script-write-flow-tools.js'
import type { RegisteredTool } from '../tool-registry.js'

export const scriptWriteTools: readonly RegisteredTool[] = [
  ...scriptWriteContentTools,
  ...scriptWriteFlowTools
]
