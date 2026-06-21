/**
 * Git 服务测试
 * 规约依据: .style-spec/core/conventions.yaml:28-31 (git_integration)
 *          .style-spec/layers/main-process/conventions.yaml:28-32
 *          .cursor/rules/testing-conventions.mdc:26-28 (Mock simple-git)
 *
 * P2-13 修复: 改用 vi.mock + vi.mocked 模式,不再依赖 globalThis 旁路 mock 状态。
 * 每个 it 在 setMock() 里覆盖 simpleGit 的返回值,测试顺序无关。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type SimpleGitMock = {
  init: ReturnType<typeof vi.fn>
  status: ReturnType<typeof vi.fn>
  add: ReturnType<typeof vi.fn>
  commit: ReturnType<typeof vi.fn>
  log: ReturnType<typeof vi.fn>
  diff: ReturnType<typeof vi.fn>
  raw: ReturnType<typeof vi.fn>
  revparse: ReturnType<typeof vi.fn>
  reset: ReturnType<typeof vi.fn>
}

const makeGit = (): SimpleGitMock => ({
  init: vi.fn(),
  status: vi.fn(),
  add: vi.fn(),
  commit: vi.fn(),
  log: vi.fn(),
  diff: vi.fn(),
  raw: vi.fn(),
  revparse: vi.fn(),
  reset: vi.fn()
})

// vi.mock 必须在 import service 之前
vi.mock('simple-git', () => ({
  simpleGit: vi.fn()
}))

// 静态 import 放在 vi.mock 之后(由于 hoisting 实际上仍然是 vi.mock 先执行)
import { simpleGit } from 'simple-git'
import { gitService } from './git-service.js'

const setMock = (m: SimpleGitMock): void => {
  vi.mocked(simpleGit).mockReturnValue(m as never)
}

describe('git-service', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'galide-gittest-'))
    mkdirSync(join(tmpDir, '.git'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('gitService.init() returns ok when .git already exists', async () => {
    const m = makeGit()
    m.init.mockResolvedValue(undefined)
    setMock(m)
    const r = await gitService.init(tmpDir)
    expect(r.ok).toBe(true)
  })

  it('gitService.status() returns initialized=false when isRepo false (no .git)', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'galide-norepo-'))
    const m = makeGit()
    m.status.mockResolvedValue({ current: null, files: [] })
    setMock(m)
    const r = await gitService.status(emptyDir)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.initialized).toBe(false)
      expect(r.value.files).toEqual([])
    }
    rmSync(emptyDir, { recursive: true, force: true })
  })

  it('gitService.status() returns files when repo exists', async () => {
    const m = makeGit()
    m.status.mockResolvedValue({
      current: 'main',
      files: [{ path: 'foo.txt', index: ' ', working_dir: 'M' }]
    })
    setMock(m)
    const r = await gitService.status(tmpDir)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.initialized).toBe(true)
      expect(r.value.current).toBe('main')
      expect(r.value.files.length).toBe(1)
    }
  })

  it('gitService.addAndCommit() returns Err when not a repo, not throw', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'galide-norepo2-'))
    const m = makeGit()
    m.add.mockResolvedValue(undefined)
    m.commit.mockResolvedValue({ commit: 'x' })
    setMock(m)
    const r = await gitService.addAndCommit(emptyDir, ['a.gal'], 'msg')
    expect(r.ok).toBe(false)
    if (r.ok === false) {
      expect(r.error.code).toBe('NOT_INITIALIZED')
    }
    rmSync(emptyDir, { recursive: true, force: true })
  })

  it('gitService.addAndCommit() returns ok on happy path', async () => {
    writeFileSync(join(tmpDir, 'a.gal'), '## scene\n')
    const m = makeGit()
    m.add.mockResolvedValue(undefined)
    m.commit.mockResolvedValue({ commit: 'deadbeef' })
    setMock(m)
    const r = await gitService.addAndCommit(tmpDir, ['a.gal'], 'update a.gal')
    expect(r.ok).toBe(true)
    expect(m.add).toHaveBeenCalledWith(['a.gal'])
    expect(m.commit).toHaveBeenCalledWith('update a.gal')
  })

  it('gitService.addAndCommit() wraps thrown error into Err (no throw)', async () => {
    writeFileSync(join(tmpDir, 'a.gal'), '## scene\n')
    const m = makeGit()
    m.add.mockRejectedValue(new Error('lockfile held'))
    setMock(m)
    const r = await gitService.addAndCommit(tmpDir, ['a.gal'], 'msg')
    expect(r.ok).toBe(false)
    if (r.ok === false) {
      expect(r.error.code).toBe('COMMIT_FAILED')
      expect(r.error.message).toContain('lockfile held')
    }
  })

  it('gitService.log() returns empty array when no repo', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'galide-norepo3-'))
    const m = makeGit()
    setMock(m)
    const r = await gitService.log(emptyDir)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual([])
    rmSync(emptyDir, { recursive: true, force: true })
  })

  it('gitService.snapshot() add 全部 + commit(allow-empty) 并返回 HEAD 哈希', async () => {
    const m = makeGit()
    m.add.mockResolvedValue(undefined)
    m.commit.mockResolvedValue({ commit: 'snap' })
    m.revparse.mockResolvedValue('deadbeef\n')
    setMock(m)
    const r = await gitService.snapshot(tmpDir, 'agent: 任务')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('deadbeef')
    expect(m.add).toHaveBeenCalledWith('.')
    expect(m.commit).toHaveBeenCalledWith('agent: 任务', undefined, { '--allow-empty': null })
  })

  it('gitService.snapshot() 非仓库 → NOT_INITIALIZED', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'galide-norepo-snap-'))
    setMock(makeGit())
    const r = await gitService.snapshot(emptyDir, 'm')
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.error.code).toBe('NOT_INITIALIZED')
    rmSync(emptyDir, { recursive: true, force: true })
  })

  it('gitService.resetHard() reset --hard 到 ref', async () => {
    const m = makeGit()
    m.reset.mockResolvedValue(undefined)
    setMock(m)
    const r = await gitService.resetHard(tmpDir, 'deadbeef')
    expect(r.ok).toBe(true)
    expect(m.reset).toHaveBeenCalledWith(['--hard', 'deadbeef'])
  })

  it('gitService.resetHard() 抛错 → RESET_FAILED(不 throw)', async () => {
    const m = makeGit()
    m.reset.mockRejectedValue(new Error('bad ref'))
    setMock(m)
    const r = await gitService.resetHard(tmpDir, 'nope')
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.error.code).toBe('RESET_FAILED')
  })

  it('gitService.log() maps simple-git entries to GitCommit', async () => {
    const m = makeGit()
    m.log.mockResolvedValue({
      all: [
        {
          hash: 'abc123',
          date: '2026-06-12',
          message: 'initial',
          author_name: 'Tester'
        }
      ]
    })
    setMock(m)
    const r = await gitService.log(tmpDir)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value[0]?.hash).toBe('abc123')
      expect(r.value[0]?.author).toBe('Tester')
    }
  })
})
