/**
 * create-default-registry — 注册全部 agent 工具
 */
import { createToolRegistry } from './tool-registry.js'
import { scriptTools } from './tools/script-tools.js'
import { manifestTools } from './tools/manifest-tools.js'
import { multimodalTools } from './tools/multimodal-tools.js'
import { commandTools } from './tools/command-tools.js'
import { analysisTools } from './tools/analysis-tools.js'

export const createDefaultToolRegistry = () =>
  createToolRegistry([
    ...scriptTools,
    ...manifestTools,
    ...multimodalTools,
    ...commandTools,
    ...analysisTools
  ])
