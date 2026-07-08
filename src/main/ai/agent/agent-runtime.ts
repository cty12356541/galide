/**
 * agent-runtime — agent 任务运行时可变项目根
 *
 * create_project / open_project 成功后须切换 projectPath,
 * 否则后续 disk 工具仍指向任务启动时的旧项目(P0)。
 */
import type { ProjectManifest } from '../../../shared/types.js'
import type { ToolContext, ToolDispatch, ToolFs } from './types.js'

export interface AgentRuntime {
  getProjectPath: () => string
  switchProject: (payload: { projectPath: string; manifest: ProjectManifest }) => void
  createToolContext: (deps: {
    fs: ToolFs
    dispatch?: ToolDispatch
    onProjectOpened?: (payload: { projectPath: string; manifest: ProjectManifest }) => Promise<void>
  }) => ToolContext
}

export const createAgentRuntime = (initial: { projectPath: string }): AgentRuntime => {
  let projectPath = initial.projectPath

  return {
    getProjectPath: () => projectPath,
    switchProject: (payload) => {
      projectPath = payload.projectPath
    },
    createToolContext: (deps) => ({
      get projectPath() {
        return projectPath
      },
      fs: deps.fs,
      dispatch: deps.dispatch,
      switchProject: async (payload) => {
        projectPath = payload.projectPath
        await deps.onProjectOpened?.(payload)
      }
    })
  }
}
