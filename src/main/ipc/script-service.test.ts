/**
 * script-service 单测
 * 规约: core/patterns.yaml:56-60 — 错误用 Result 而非抛异常
 *       core/conventions.yaml:28 — git commit 由 preferences 控制
 */
import { describe, it, expect } from 'vitest'
import {
  validateFileName,
  readScript,
  writeScript,
  listScripts,
  type ScriptFs,
  type ScriptGit
} from './script-service.js'
import type { GitPreferences } from '../../shared/preferences.js'
import type { Result } from '../../shared/dsl/types.js'

const baseGitPrefs: GitPreferences = {
  autoInit: false,
  autoCommitOnSave: false,
  defaultAuthorName: 'Tester',
  defaultAuthorEmail: 'tester@example.com',
  initialCommitMessage: 'initial'
}

const makeFs = (overrides: Partial<ScriptFs> = {}): ScriptFs => ({
  readFile: async () => '',
  writeFile: async () => undefined,
  readDir: async () => [],
  ...overrides
})

const makeGit = (): ScriptGit & { calls: Array<{ files: readonly string[]; msg: string }> } => {
  const calls: Array<{ files: readonly string[]; msg: string }> = []
  return {
    calls,
    addAndCommit: async (_p, files, msg) => {
      calls.push({ files, msg })
      return { ok: true, value: true }
    }
  }
}

describe('validateFileName', () => {
  it('accepts a simple .gal file', () => {
    expect(validateFileName('chapter1.gal')).toEqual({ ok: true, value: 'chapter1.gal' })
  })

  it('accepts underscore and dash', () => {
    expect(validateFileName('ch_01-intro.gal')).toEqual({ ok: true, value: 'ch_01-intro.gal' })
  })

  it('rejects empty string', () => {
    const r = validateFileName('')
    expect(r.ok).toBe(false)
  })

  it('rejects path traversal', () => {
    const r = validateFileName('../etc/passwd.gal')
    expect(r.ok).toBe(false)
    if (r.ok !== true) expect(r.error.code).toBe('INVALID_FILENAME')
  })

  it('rejects subdirectory', () => {
    const r = validateFileName('subdir/file.gal')
    expect(r.ok).toBe(false)
    if (r.ok !== true) expect(r.error.code).toBe('INVALID_FILENAME')
  })

  it('rejects non-.gal extension', () => {
    const r = validateFileName('chapter1.txt')
    expect(r.ok).toBe(false)
  })

  it('rejects whitespace', () => {
    const r = validateFileName('chapter 1.gal')
    expect(r.ok).toBe(false)
  })

  it('rejects leading dot (hidden file)', () => {
    const r = validateFileName('.gitignore.gal')
    expect(r.ok).toBe(false)
  })
})

describe('readScript', () => {
  it('returns content on happy path', async () => {
    const fs = makeFs({ readFile: async () => '## scene\n' })
    const r = await readScript('/proj', 'a.gal', { fs })
    expect(r).toEqual({ ok: true, value: '## scene\n' })
  })

  it('returns INVALID_FILENAME without touching fs', async () => {
    let touched = false
    const fs = makeFs({
      readFile: async () => {
        touched = true
        return ''
      }
    })
    const r = await readScript('/proj', '../bad.gal', { fs })
    expect(r.ok).toBe(false)
    expect(touched).toBe(false)
  })

  it('returns READ_FAILED when read throws', async () => {
    const fs = makeFs({
      readFile: async () => {
        throw Object.assign(new Error('boom'), { code: 'EACCES' })
      }
    })
    const r = await readScript('/proj', 'a.gal', { fs })
    expect(r.ok).toBe(false)
    if (r.ok !== true) expect(r.error.code).toBe('READ_FAILED')
  })
})

describe('writeScript', () => {
  it('writes file and commits when autoCommitOnSave=true', async () => {
    const written: Array<{ path: string; content: string }> = []
    const fs = makeFs({
      writeFile: async (path, content) => {
        written.push({ path, content })
      }
    })
    const git = makeGit()
    const r = await writeScript('/proj', 'a.gal', 'hi', {
      fs,
      git,
      gitPrefs: { ...baseGitPrefs, autoCommitOnSave: true }
    })
    expect(r.ok).toBe(true)
    expect(written).toHaveLength(1)
    expect(written[0]?.path).toContain('scripts/a.gal')
    expect(git.calls).toHaveLength(1)
    expect(git.calls[0]?.files).toEqual(['scripts/a.gal'])
    expect(git.calls[0]?.msg).toBe('update: a.gal')
  })

  it('writes file but skips commit when autoCommitOnSave=false', async () => {
    const fs = makeFs({ writeFile: async () => undefined })
    const git = makeGit()
    const r = await writeScript('/proj', 'a.gal', 'hi', {
      fs,
      git,
      gitPrefs: { ...baseGitPrefs, autoCommitOnSave: false }
    })
    expect(r.ok).toBe(true)
    expect(git.calls).toHaveLength(0)
  })

  it('rejects INVALID_FILENAME without touching fs or git', async () => {
    let touched = false
    const fs = makeFs({
      writeFile: async () => {
        touched = true
      }
    })
    const git = makeGit()
    const r = await writeScript('/proj', '../bad.gal', 'x', {
      fs,
      git,
      gitPrefs: { ...baseGitPrefs, autoCommitOnSave: true }
    })
    expect(r.ok).toBe(false)
    if (r.ok !== true) expect(r.error.code).toBe('INVALID_FILENAME')
    expect(touched).toBe(false)
    expect(git.calls).toHaveLength(0)
  })

  it('returns WRITE_FAILED when write throws', async () => {
    const fs = makeFs({
      writeFile: async () => {
        throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
      }
    })
    const git = makeGit()
    const r = await writeScript('/proj', 'a.gal', 'x', {
      fs,
      git,
      gitPrefs: baseGitPrefs
    })
    expect(r.ok).toBe(false)
    if (r.ok !== true) expect(r.error.code).toBe('WRITE_FAILED')
    expect(git.calls).toHaveLength(0)
  })

  it('returns COMMIT_FAILED when git fails — disk file is already written (intentional)', async () => {
    const fs = makeFs({ writeFile: async () => undefined })
    const git: ScriptGit = {
      addAndCommit: async (): Promise<Result<true, { code: string; message: string }>> => ({
        ok: false,
        error: { code: 'COMMIT_FAILED', message: 'lockfile held' }
      })
    }
    const r = await writeScript('/proj', 'a.gal', 'x', {
      fs,
      git,
      gitPrefs: { ...baseGitPrefs, autoCommitOnSave: true }
    })
    expect(r.ok).toBe(false)
    if (r.ok !== true) expect(r.error.code).toBe('COMMIT_FAILED')
  })
})

describe('listScripts', () => {
  it('returns only top-level .gal files', async () => {
    const fs = makeFs({
      readDir: async () => ['a.gal', 'b.gal', 'README.md', 'sub']
    })
    const r = await listScripts('/proj', { fs })
    expect(r).toEqual({ ok: true, value: ['a.gal', 'b.gal'] })
  })

  it('returns empty array when scripts/ does not exist', async () => {
    const fs = makeFs({
      readDir: async () => {
        throw Object.assign(new Error('nope'), { code: 'ENOENT' })
      }
    })
    const r = await listScripts('/proj', { fs })
    expect(r).toEqual({ ok: true, value: [] })
  })

  it('returns READ_FAILED for non-ENOENT errors', async () => {
    const fs = makeFs({
      readDir: async () => {
        throw Object.assign(new Error('perm denied'), { code: 'EACCES' })
      }
    })
    const r = await listScripts('/proj', { fs })
    expect(r.ok).toBe(false)
    if (r.ok !== true) expect(r.error.code).toBe('READ_FAILED')
  })
})
