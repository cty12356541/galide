/**
 * replace-service — 主进程编排层测试
 *
 * 两组:
 *  1. 注入 mock fs/git 的单元测试(preview 不写盘、快照 fail-closed、stale 冲突)。
 *  2. 真实 tmp git 仓库集成测试:gitService.snapshot/resetHard 真实执行,
 *     断言快照 ref 存在、apply 后内容变更、rollback 后内容还原。
 *     (仅在 FIXTURE tmp 仓库内跑 git,不触碰本仓库。)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  applyScriptReplace,
  previewScriptReplace,
  rollbackScriptReplace,
  REPLACE_SNAPSHOT_LABEL,
  type ReplaceFs,
  type ReplaceGit
} from './replace-service.js'
import { collectReplaceMatches } from '../../shared/dsl/replace-in-scripts.js'
import { gitService } from '../git/git-service.js'

const hasGit = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

const FIXTURE = ['## 开场', '艾: "我是艾。"', '雪: "艾艾子今天去了艾河边。"'].join('\n')

type MemFs = ReplaceFs & { files: Map<string, string> }

const makeMemFs = (initial: Record<string, string>): MemFs => {
  const files = new Map(Object.entries(initial))
  return {
    files,
    readFile: (p) => {
      const c = files.get(p)
      return c === undefined ? Promise.reject(new Error(`ENOENT: ${p}`)) : Promise.resolve(c)
    },
    writeFile: (p, c) => {
      files.set(p, c)
      return Promise.resolve()
    },
    readDir: () => Promise.resolve([...files.keys()].map((p) => p.split('/').pop() ?? ''))
  }
}

const makeGitMock = (): ReplaceGit & {
  snapshot: ReturnType<typeof vi.fn>
  resetHard: ReturnType<typeof vi.fn>
} => ({
  snapshot: vi.fn(() => Promise.resolve({ ok: true as const, value: 'snapref123' })),
  resetHard: vi.fn(() => Promise.resolve({ ok: true as const, value: true as const }))
})

describe('previewScriptReplace', () => {
  it('返回匹配列表,绝不写盘', async () => {
    const fs = makeMemFs({ '/proj/scripts/a.gal': FIXTURE })
    const r = await previewScriptReplace('/proj', { query: '艾', mode: 'plain' }, { fs })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.matches.length).toBeGreaterThan(0)
      expect(r.value.truncated).toBe(false)
    }
    expect(fs.files.get('/proj/scripts/a.gal')).toBe(FIXTURE)
  })

  it('regex=true 且正则非法 → INVALID_REGEX', async () => {
    const fs = makeMemFs({ '/proj/scripts/a.gal': FIXTURE })
    const r = await previewScriptReplace('/proj', { query: '([', mode: 'plain', regex: true }, { fs })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('INVALID_REGEX')
  })
})

describe('applyScriptReplace — mock git', () => {
  it('先快照后写盘;snapshotRef 随结果返回', async () => {
    const fs = makeMemFs({ '/proj/scripts/a.gal': FIXTURE })
    const git = makeGitMock()
    const callOrder: string[] = []
    git.snapshot.mockImplementation(() => {
      callOrder.push('snapshot')
      return Promise.resolve({ ok: true as const, value: 'snapref123' })
    })
    const origWrite = fs.writeFile
    fs.writeFile = (p, c) => {
      callOrder.push('write')
      return origWrite(p, c)
    }

    const pre = await collectReplaceMatches('/proj/scripts', '艾', { mode: 'token' }, { readdir: fs.readDir, readFile: fs.readFile })
    const r = await applyScriptReplace('/proj', '小艾', pre.matches, { fs, git })

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.snapshotRef).toBe('snapref123')
      expect(r.value.applied).toBe(1)
      expect(r.value.conflicts).toEqual([])
      expect(r.value.filesChanged).toHaveLength(1)
    }
    expect(git.snapshot).toHaveBeenCalledWith('/proj', REPLACE_SNAPSHOT_LABEL)
    expect(callOrder).toEqual(['snapshot', 'write'])
    expect(fs.files.get('/proj/scripts/a.gal')).toContain('小艾: "我是艾。"')
    // token 模式:正文散文保持原样
    expect(fs.files.get('/proj/scripts/a.gal')).toContain('雪: "艾艾子今天去了艾河边。"')
  })

  it('快照失败 → SNAPSHOT_FAILED,零写入(fail-closed)', async () => {
    const fs = makeMemFs({ '/proj/scripts/a.gal': FIXTURE })
    const git = makeGitMock()
    git.snapshot.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_INITIALIZED', message: '项目尚未 git init' }
    })
    const pre = await collectReplaceMatches('/proj/scripts', '艾', { mode: 'plain' }, { readdir: fs.readDir, readFile: fs.readFile })
    const r = await applyScriptReplace('/proj', '小艾', pre.matches, { fs, git })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('SNAPSHOT_FAILED')
    expect(fs.files.get('/proj/scripts/a.gal')).toBe(FIXTURE)
  })

  it('stale 匹配(matchedText 不符)→ conflicts,文件不写', async () => {
    const fs = makeMemFs({ '/proj/scripts/a.gal': FIXTURE })
    const git = makeGitMock()
    const pre = await collectReplaceMatches('/proj/scripts', '艾', { mode: 'token' }, { readdir: fs.readDir, readFile: fs.readFile })
    const stale = pre.matches.map((m) => ({ ...m, matchedText: '雪' }))
    const r = await applyScriptReplace('/proj', '小艾', stale, { fs, git })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.applied).toBe(0)
      expect(r.value.conflicts).toEqual(stale.map((m) => m.id))
      expect(r.value.filesChanged).toEqual([])
    }
    expect(fs.files.get('/proj/scripts/a.gal')).toBe(FIXTURE)
  })

  it('非法匹配(路径穿越文件名)→ INVALID_MATCH,快照都不做', async () => {
    const fs = makeMemFs({ '/proj/scripts/a.gal': FIXTURE })
    const git = makeGitMock()
    const r = await applyScriptReplace(
      '/proj',
      'x',
      [{ id: 'evil', file: '../evil.gal', start: 0, end: 1, matchedText: '艾' }],
      { fs, git }
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('INVALID_MATCH')
    expect(git.snapshot).not.toHaveBeenCalled()
  })

  it('空 matches / 超上限 matches → INVALID_MATCH', async () => {
    const fs = makeMemFs({})
    const git = makeGitMock()
    const empty = await applyScriptReplace('/proj', 'x', [], { fs, git })
    expect(empty.ok).toBe(false)
  })

  it('rollbackScriptReplace 透传 resetHard;失败 → ROLLBACK_FAILED', async () => {
    const git = makeGitMock()
    const ok = await rollbackScriptReplace('/proj', 'snapref123', { git })
    expect(ok.ok).toBe(true)
    expect(git.resetHard).toHaveBeenCalledWith('/proj', 'snapref123')

    git.resetHard.mockResolvedValue({ ok: false, error: { code: 'RESET_FAILED', message: 'bad ref' } })
    const fail = await rollbackScriptReplace('/proj', 'nope', { git })
    expect(fail.ok).toBe(false)
    if (!fail.ok) expect(fail.error.code).toBe('ROLLBACK_FAILED')
  })
})

describe.runIf(hasGit)('applyScriptReplace — 真实 tmp git 仓库(快照/回滚集成)', () => {
  let dir = ''
  const realFs: ReplaceFs = {
    readFile: (p) => fsp.readFile(p, 'utf-8'),
    writeFile: (p, c) => fsp.writeFile(p, c, 'utf-8'),
    readDir: (p) => fsp.readdir(p)
  }
  const realGit: ReplaceGit = {
    snapshot: (p, label) => gitService.snapshot(p, label),
    resetHard: (p, ref) => gitService.resetHard(p, ref)
  }
  const git = (args: string[]): string =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf-8' }).trim()

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'galide-replace-it-'))
    mkdirSync(join(dir, 'scripts'))
    writeFileSync(join(dir, 'scripts', 'a.gal'), FIXTURE)
    git(['init'])
    git(['config', 'user.name', 'galide-test'])
    git(['config', 'user.email', 'test@galide.local'])
    git(['add', '-A'])
    git(['commit', '-m', 'init'])
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('apply 后快照 ref 真实存在;rollback 后文件内容还原', async () => {
    const headBefore = git(['rev-parse', 'HEAD'])

    const pre = await previewScriptReplace(dir, { query: '艾', mode: 'token' }, { fs: realFs })
    expect(pre.ok).toBe(true)
    if (!pre.ok) return
    const r = await applyScriptReplace(dir, '小艾', pre.value.matches, { fs: realFs, git: realGit })
    expect(r.ok).toBe(true)
    if (!r.ok) return

    // 快照 ref 是一个真实 commit(git cat-file 可达),且工作区已应用替换
    expect(git(['cat-file', '-t', r.value.snapshotRef])).toBe('commit')
    expect(readFileSync(join(dir, 'scripts', 'a.gal'), 'utf-8')).toContain('小艾: "我是艾。"')

    // rollback 到快照前的 HEAD?— 快照本身即替换前状态(add -A + commit),
    // reset --hard 到快照 ref = 回到「替换前内容」
    const rb = await rollbackScriptReplace(dir, r.value.snapshotRef, { git: realGit })
    expect(rb.ok).toBe(true)
    expect(readFileSync(join(dir, 'scripts', 'a.gal'), 'utf-8')).toBe(FIXTURE)
    expect(git(['rev-parse', 'HEAD'])).not.toBe(headBefore)
  })
})
