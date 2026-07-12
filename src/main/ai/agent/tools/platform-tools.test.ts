/**
 * platform-tools 单测 — headless 导出 / 提交 / 建项
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../export/run-export-job.js', () => ({
  runExportJob: vi.fn(async () => ({ ok: true, paths: ['/out/index.html'] }))
}))

vi.mock('../../../git/git-service.js', () => ({
  gitService: {
    addAndCommit: vi.fn(async () => ({ ok: true, value: true }))
  }
}))

vi.mock('../../../ipc/project-service.js', () => ({
  createProject: vi.fn(async () => ({
    ok: true,
    value: { projectPath: '/tmp/new-proj', manifest: { name: 'Test' } }
  }))
}))

vi.mock('../../../ipc/project-handlers.js', () => ({
  projectFsAdapter: {},
  projectGitAdapter: {},
  openProjectAtPath: vi.fn(async () => ({
    ok: true,
    projectPath: '/tmp/existing',
    manifest: { name: 'Existing' }
  }))
}))

vi.mock('../../../preferences/preferences-store.js', () => ({
  getPreference: vi.fn((key: string) => {
    if (key === 'export') return { defaultTarget: 'web', defaultOutputDir: '', includeAssets: true }
    if (key === 'git') return { autoInit: false, autoCommitOnSave: false, initialCommitMessage: 'init' }
    return {}
  })
}))

import { runExportJob } from '../../../export/run-export-job.js'
import { gitService } from '../../../git/git-service.js'
import { createProject } from '../../../ipc/project-service.js'
import { openProjectAtPath } from '../../../ipc/project-handlers.js'
import { platformTools } from './platform-tools.js'

const ctx = {
  projectPath: '/proj',
  fs: {
    readFile: async () => '',
    writeFile: async () => undefined,
    readdir: async () => []
  }
}

const getTool = (name: string) => {
  const t = platformTools.find((x) => x.name === name)
  if (!t) throw new Error(`tool ${name} not found`)
  return t
}

describe('platform-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('export_project 调用 runExportJob', async () => {
    const t = getTool('export_project')
    const r = await t.run({}, ctx)
    expect(r.ok).toBe(true)
    expect(runExportJob).toHaveBeenCalled()
    expect(r.content).toContain('已导出')
  })

  it('git_commit 调用 gitService.addAndCommit', async () => {
    const t = getTool('git_commit')
    const r = await t.run({ message: 'update script' }, ctx)
    expect(r.ok).toBe(true)
    expect(gitService.addAndCommit).toHaveBeenCalledWith('/proj', ['.'], 'update script')
  })

  it('create_project 调用 createProject headless', async () => {
    const t = getTool('create_project')
    const r = await t.run({ name: 'Demo', directory: '/proj/demo' }, ctx)
    expect(r.ok).toBe(true)
    expect(createProject).toHaveBeenCalled()
    expect(r.content).toContain('/tmp/new-proj')
  })

  it('open_project 验证并通知 renderer(legacy notifyProjectOpened)', async () => {
    const notify = vi.fn(async () => undefined)
    const t = getTool('open_project')
    const r = await t.run({ projectPath: '/tmp/existing' }, { ...ctx, notifyProjectOpened: notify })
    expect(r.ok).toBe(true)
    expect(openProjectAtPath).toHaveBeenCalledWith('/tmp/existing')
    expect(notify).toHaveBeenCalled()
  })

  it('open_project 成功后 switchProject 更新 ctx.projectPath', async () => {
    const { createAgentRuntime } = await import('../agent-runtime.js')
    const rt = createAgentRuntime({ projectPath: '/proj' })
    const runtimeCtx = rt.createToolContext({ fs: ctx.fs })
    const t = getTool('open_project')
    expect(runtimeCtx.projectPath).toBe('/proj')
    const r = await t.run({ projectPath: '/tmp/existing' }, runtimeCtx)
    expect(r.ok).toBe(true)
    expect(runtimeCtx.projectPath).toBe('/tmp/existing')
  })

  it('create_project 成功后 switchProject 切换到新项目', async () => {
    const { createAgentRuntime } = await import('../agent-runtime.js')
    const rt = createAgentRuntime({ projectPath: '/proj' })
    const runtimeCtx = rt.createToolContext({ fs: ctx.fs })
    const t = getTool('create_project')
    const r = await t.run({ name: 'Demo', directory: '/proj/demo' }, runtimeCtx)
    expect(r.ok).toBe(true)
    expect(runtimeCtx.projectPath).toBe('/tmp/new-proj')
  })
})
