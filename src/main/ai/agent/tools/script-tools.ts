/**
 * script-tools — 剧本/决策树工具(只读 + 安全写)
 *
 * 已拆分为子模块,本文件保留聚合导出以保证向后兼容。
 * 见 script-read-tools.ts / script-write-content-tools.ts / script-write-flow-tools.ts / script-edit-tools.ts
 */
import { scriptReadTools } from './script-read-tools.js'
import { scriptWriteContentTools } from './script-write-content-tools.js'
import { scriptWriteFlowTools } from './script-write-flow-tools.js'
import { scriptEditTools } from './script-edit-tools.js'
import type { RegisteredTool } from '../tool-registry.js'

/** 剧本相关工具集合(注册进 tool-registry) */
export const scriptTools: readonly RegisteredTool[] = [
  ...scriptReadTools,
  ...scriptWriteContentTools,
  ...scriptWriteFlowTools,
  ...scriptEditTools
]
