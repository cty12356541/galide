/**
 * platform-tools — headless 平台操作(导出 / 提交 / 建项 / 开项)
 *
 * disk 域工具,在 main 进程直接执行,不依赖 renderer 对话框。
 */
import path from 'node:path'
import { promises as fs } from 'node:fs'
import * as z from 'zod/v4'
import { defineTool, type RegisteredTool } from '../tool-registry.js'
import type { ToolContext, ToolHandlerResult } from '../types.js'
import type { ProjectManifest } from '../../../../shared/types.js'
import { runExportJob } from '../../../export/run-export-job.js'
import { gitService } from '../../../git/git-service.js'
import { getPreference } from '../../../preferences/preferences-store.js'
import { createProject } from '../../../ipc/project-service.js'
import { projectFsAdapter, projectGitAdapter, openProjectAtPath } from '../../../ipc/project-handlers.js'
import type { ExportTarget } from '../../../../shared/types.js'
import { ExportTargetSchema } from '../../../ipc/schemas/index.js'

const applyProjectSwitch = async (
  ctx: ToolContext,
  payload: { projectPath: string; manifest: ProjectManifest }
): Promise<void> => {
  if (ctx.switchProject) {
    await ctx.switchProject(payload)
    return
  }
  if (ctx.notifyProjectOpened) {
    await ctx.notifyProjectOpened(payload)
  }
}

const defaultExportOutputPath = (projectPath: string, target: ExportTarget): string => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return path.join(projectPath, 'exports', `${target}-${stamp}`)
}

const exportProject = defineTool({
  name: 'export_project',
  description:
    'headless 导出项目到指定目录(默认 project/exports/{target}-{timestamp}/)。无需打开导出对话框。',
  risk: 'destructive',
  domain: 'disk',
  schema: z.object({
    target: ExportTargetSchema.optional(),
    outputPath: z.string().optional()
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const exportPrefs = getPreference('export')
    const target = args.target ?? exportPrefs.defaultTarget
    const outputPath = args.outputPath ?? defaultExportOutputPath(ctx.projectPath, target)
    const resolvedOut = path.resolve(outputPath)
    const resolvedProj = path.resolve(ctx.projectPath)
    if (!resolvedOut.startsWith(resolvedProj + path.sep)) {
      return { ok: false, content: `导出路径必须在项目目录内: ${outputPath}`, error: { code: 'OUTSIDE_PROJECT', message: '路径越界' } }
    }
    try {
      const result = await runExportJob(
        { projectPath: ctx.projectPath, target, outputPath },
        {
          fs: {
            readdir: (p) => fs.readdir(p),
            readFile: (p) => fs.readFile(p, 'utf-8'),
            mkdir: (p, o) => fs.mkdir(p, o).then(() => undefined)
          }
        }
      )
      if (result.ok === false) {
        return {
          ok: false,
          content: `导出失败: ${result.error}`,
          error: { code: result.code, message: result.error }
        }
      }
      return {
        ok: true,
        content: `已导出 ${target} 到 ${outputPath} (${result.paths.length} 个文件)`,
        data: { paths: result.paths, outputPath }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return {
        ok: false,
        content: `导出异常: ${message}`,
        error: { code: 'EXPORT_FAILED', message }
      }
    }
  }
})

const gitCommit = defineTool({
  name: 'git_commit',
  description: 'headless Git 提交(默认 add .)。无需打开提交对话框。',
  risk: 'destructive',
  domain: 'disk',
  schema: z.object({
    message: z.string().min(1),
    files: z.array(z.string()).optional()
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const files = args.files ?? ['.']
    const r = await gitService.addAndCommit(ctx.projectPath, files, args.message)
    if (r.ok !== true) {
      return {
        ok: false,
        content: `提交失败: ${r.error.message}`,
        error: { code: r.error.code, message: r.error.message }
      }
    }
    return { ok: true, content: `已提交: ${args.message}` }
  }
})

const createProjectTool = defineTool({
  name: 'create_project',
  description: 'headless 在指定目录创建新项目(目录须为空或不存在)。无需打开新建项目对话框。',
  risk: 'destructive',
  domain: 'disk',
  schema: z.object({
    name: z.string().min(1).max(80),
    directory: z.string().min(1)
  }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const resolvedDir = path.resolve(args.directory)
    const resolvedProj = path.resolve(ctx.projectPath)
    if (!resolvedDir.startsWith(resolvedProj + path.sep)) {
      return { ok: false, content: `创建路径必须在项目目录内: ${args.directory}`, error: { code: 'OUTSIDE_PROJECT', message: '路径越界' } }
    }
    const r = await createProject(
      args.name,
      {
        fs: projectFsAdapter,
        git: projectGitAdapter,
        dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
        gitPrefs: getPreference('git')
      },
      { projectPath: args.directory }
    )
    if (r.ok !== true) {
      return {
        ok: false,
        content: `创建项目失败: ${r.error.message}`,
        error: { code: r.error.code, message: r.error.message }
      }
    }
    await applyProjectSwitch(ctx, {
      projectPath: r.value.projectPath,
      manifest: r.value.manifest
    })
    return {
      ok: true,
      content: `已创建项目 ${args.name} 于 ${r.value.projectPath}`,
      data: { projectPath: r.value.projectPath }
    }
  }
})

const openProject = defineTool({
  name: 'open_project',
  description: 'headless 打开已有项目路径(验证 .galproj 可读)。会通知 renderer 切换当前项目。',
  risk: 'destructive',
  domain: 'disk',
  schema: z.object({ projectPath: z.string().min(1) }),
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const resolvedPath = path.resolve(args.projectPath)
    const resolvedProj = path.resolve(ctx.projectPath)
    if (!resolvedPath.startsWith(resolvedProj + path.sep)) {
      return { ok: false, content: `打开路径必须在项目目录内: ${args.projectPath}`, error: { code: 'OUTSIDE_WORKSPACE', message: '路径越界' } }
    }
    const r = await openProjectAtPath(resolvedPath)
    if (!r.ok) {
      return {
        ok: false,
        content: `打开项目失败: ${r.error ?? 'unknown'}`,
        error: { code: 'OPEN_FAILED', message: r.error ?? 'open failed' }
      }
    }
    await applyProjectSwitch(ctx, {
      projectPath: r.projectPath!,
      manifest: r.manifest!
    })
    return { ok: true, content: `已打开项目 ${resolvedPath}` }
  }
})

export const platformTools: readonly RegisteredTool[] = [
  exportProject,
  gitCommit,
  createProjectTool,
  openProject
]
