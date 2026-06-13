/**
 * project-service 单测
 * 规约: layers/main-process/conventions.yaml: git init 失败回滚 .git
 *       core/patterns.yaml:56-60 — 错误用 Result 而非抛异常
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProject, type ProjectFs, type ProjectGit, type ProjectDialog } from './project-service.js'
import type { GitPreferences } from '../../shared/preferences.js'

const baseGitPrefs: GitPreferences = {
  autoInit: false,
  autoCommitOnSave: false,
  defaultAuthorName: 'Tester',
  defaultAuthorEmail: 'tester@example.com',
  initialCommitMessage: 'initial'
}

type Log = Array<{ op: string; args: unknown[] }>
const makeFs = (): ProjectFs & { log: Log } => {
  const log: Log = []
  return {
    log,
    mkdir: async (...args) => {
      log.push({ op: 'mkdir', args })
    },
    writeFile: async (...args) => {
      log.push({ op: 'writeFile', args })
    },
    readFile: async (...args) => {
      log.push({ op: 'readFile', args })
      return ''
    },
    rm: async (...args) => {
      log.push({ op: 'rm', args })
    },
    exists: async (...args) => {
      log.push({ op: 'exists', args })
      return true
    }
  }
}

const makeGit = (
  init: (p: string) => Promise<{ ok: true; value: true } | { ok: false; error: { code: string; message: string } }> = async () => ({
    ok: true,
    value: true
  }),
  commit: (p: string, msg: string) => Promise<{ ok: true; value: true } | { ok: false; error: { code: string; message: string } }> = async () => ({
    ok: true,
    value: true
  })
): ProjectGit & { calls: { init: number; commit: number } } => {
  const calls = { init: 0, commit: 0 }
  return {
    calls,
    init: async (p) => {
      calls.init++
      return init(p)
    },
    createInitialCommit: async (p, m) => {
      calls.commit++
      return commit(p, m)
    }
  }
}

const makeDialog = (projectPath: string): ProjectDialog => ({
  showOpenDialog: async () => ({ canceled: false, filePaths: [projectPath] })
})

describe('createProject', () => {
  it('happy path: writes layout + manifest + first script + git init + commit', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'galide-create-'))
    tmpRoots.push(tmpRoot)
    const projectPath = join(tmpRoot, 'myproj')
    const fs = makeFs()
    const git = makeGit()
    const dialog = makeDialog(projectPath)

    const r = await createProject('MyProject', {
      fs,
      git,
      dialog,
      gitPrefs: { ...baseGitPrefs, autoInit: true }
    })
    expect(r.ok).toBe(true)
    if (r.ok !== true) return
    expect(r.value.projectPath).toBe(projectPath)
    expect(r.value.manifest.version).toBe('0.1.0')
    expect(r.value.manifest.name).toBe('MyProject')
    expect(r.value.manifest.git?.initialized).toBe(true)
    expect(git.calls.init).toBe(1)
    expect(git.calls.commit).toBe(1)
    // 文件系统调用顺序:mkdir(layout) → writeFile(.galproj) → writeFile(chapter1.gal) → git init → git commit → writeFile(.galproj 更新 git=true)
    expect(fs.log.find((l) => l.op === 'writeFile' && (l.args[0] as string).endsWith('chapter1.gal'))).toBeTruthy()
  })

  it('autoInit=false: skips git entirely', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'galide-create2-'))
    tmpRoots.push(tmpRoot)
    const projectPath = join(tmpRoot, 'no-git')
    const fs = makeFs()
    const git = makeGit()
    const dialog = makeDialog(projectPath)

    const r = await createProject('NoGit', {
      fs,
      git,
      dialog,
      gitPrefs: { ...baseGitPrefs, autoInit: false }
    })
    expect(r.ok).toBe(true)
    if (r.ok !== true) return
    expect(r.value.manifest.git?.initialized).toBe(false)
    expect(git.calls.init).toBe(0)
    expect(git.calls.commit).toBe(0)
  })

  it('autoInit=true but git.init fails: rolls back .git, manifest.git=false', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'galide-create3-'))
    tmpRoots.push(tmpRoot)
    const projectPath = join(tmpRoot, 'broken-git')
    const fs = makeFs()
    const git = makeGit(async () => ({ ok: false, error: { code: 'INIT_FAILED', message: 'no git binary' } }))
    const dialog = makeDialog(projectPath)

    const r = await createProject('BrokenGit', {
      fs,
      git,
      dialog,
      gitPrefs: { ...baseGitPrefs, autoInit: true }
    })
    expect(r.ok).toBe(true)
    if (r.ok !== true) return
    expect(r.value.manifest.git?.initialized).toBe(false)
    expect(git.calls.commit).toBe(0)
    // .git 没创建,不需要 rm 调用
    expect(fs.log.filter((l) => l.op === 'rm').length).toBe(0)
  })

  it('autoInit=true + init ok + commit fails: rolls back .git, manifest.git=false', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'galide-create4-'))
    tmpRoots.push(tmpRoot)
    const projectPath = join(tmpRoot, 'broken-commit')
    const fs = makeFs()
    const git = makeGit(
      async () => ({ ok: true, value: true }),
      async () => ({ ok: false, error: { code: 'COMMIT_FAILED', message: 'no user.name' } })
    )
    const dialog = makeDialog(projectPath)

    const r = await createProject('BrokenCommit', {
      fs,
      git,
      dialog,
      gitPrefs: { ...baseGitPrefs, autoInit: true }
    })
    expect(r.ok).toBe(true)
    if (r.ok !== true) return
    expect(r.value.manifest.git?.initialized).toBe(false)
    expect(git.calls.init).toBe(1)
    expect(git.calls.commit).toBe(1)
    // 必须 rm .git 回滚
    const rmCall = fs.log.find((l) => l.op === 'rm')
    expect(rmCall).toBeTruthy()
    expect((rmCall?.args[0] as string).endsWith('.git')).toBe(true)
  })

  it('dialog canceled: returns ok=false with canceled code', async () => {
    const fs = makeFs()
    const git = makeGit()
    const dialog: ProjectDialog = { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) }
    const r = await createProject('X', { fs, git, dialog, gitPrefs: baseGitPrefs })
    expect(r.ok).toBe(false)
    if (r.ok !== false) return
    expect(r.error.code).toBe('CANCELED')
    // 任何 fs 操作都不应发生
    expect(fs.log.length).toBe(0)
    expect(git.calls.init).toBe(0)
  })

  it('empty name rejected: returns INVALID_NAME', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'galide-create5-'))
    tmpRoots.push(tmpRoot)
    const fs = makeFs()
    const git = makeGit()
    const dialog = makeDialog(join(tmpRoot, 'x'))
    const r = await createProject('   ', { fs, git, dialog, gitPrefs: baseGitPrefs })
    expect(r.ok).toBe(false)
    if (r.ok !== false) return
    expect(r.error.code).toBe('INVALID_NAME')
    expect(fs.log.length).toBe(0)
  })

  it('name trimmed and length-capped to 80', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'galide-create6-'))
    tmpRoots.push(tmpRoot)
    const projectPath = join(tmpRoot, 'p')
    const fs = makeFs()
    const git = makeGit()
    const dialog = makeDialog(projectPath)
    const longName = 'a'.repeat(200)
    const r = await createProject(`   ${longName}   `, {
      fs,
      git,
      dialog,
      gitPrefs: { ...baseGitPrefs, autoInit: false }
    })
    expect(r.ok).toBe(true)
    if (r.ok !== true) return
    expect(r.value.manifest.name.length).toBeLessThanOrEqual(80)
    expect(r.value.manifest.name.startsWith('a')).toBe(true)
  })
})

const tmpRoots: string[] = []
afterEach(() => {
  while (tmpRoots.length) {
    const r = tmpRoots.pop()
    if (r) rmSync(r, { recursive: true, force: true })
  }
})
