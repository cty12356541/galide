/**
 * Git 服务化封装(规约: layers/main-process/conventions.yaml:28-32)
 *
 * 所有 git 操作必须经由此 service,IPC handler 不直接调用 simple-git。
 * - library: simple-git npm 包(core/conventions.yaml:25)
 * - no_cli: 禁止 child_process.exec('git ...')(core/conventions.yaml:31)
 * - 错误用 Result<T, E> 而非抛异常(core/patterns.yaml:56-60)
 */
import { simpleGit, type SimpleGit, type StatusResult, type LogResult } from 'simple-git'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Result } from '../../shared/dsl/types.js'

export type GitError = {
  code:
    | 'NOT_INITIALIZED'
    | 'INIT_FAILED'
    | 'COMMIT_FAILED'
    | 'STATUS_FAILED'
    | 'LOG_FAILED'
    | 'DIFF_FAILED'
    | 'RESET_FAILED'
    | 'NOT_FOUND'
  message: string
}

export type GitStatus = {
  initialized: boolean
  current: string | null
  files: { path: string; index: string; working_dir: string }[]
}

export type GitCommit = {
  hash: string
  date: string
  message: string
  author: string
}

const errOf = (code: GitError['code'], message: string): { ok: false; error: GitError } => ({
  ok: false,
  error: { code, message }
})

const okOf = <T>(value: T): { ok: true; value: T } => ({ ok: true, value })

const getGit = (projectPath: string): SimpleGit => {
  // simpleGit 本身是 SimpleGitFactory(可调用接口),直接 simpleGit(projectPath) 即可;
  // simpleGit 内部仅缓存配置,不执行 git 命令,不会抛。
  return simpleGit(projectPath)
}

const isRepo = async (projectPath: string): Promise<boolean> => {
  try {
    await fs.stat(join(projectPath, '.git'))
    return true
  } catch {
    return false
  }
}

/**
 * 初始化仓库并提交全部文件。
 * 若 .git 已存在则跳过 init(允许"打开老项目时再保险"语义)。
 */
export const init = async (projectPath: string): Promise<Result<true, GitError>> => {
  try {
    const git = getGit(projectPath)
    if (!(await isRepo(projectPath))) {
      await git.init()
    }
    return okOf(true)
  } catch (e) {
    return errOf('INIT_FAILED', e instanceof Error ? e.message : String(e))
  }
}

/**
 * 第一次提交(供 project:create 调用)。
 * 等价于 add('.') + commit(message),但若工作区无变更则不报错。
 */
export const createInitialCommit = async (
  projectPath: string,
  message: string
): Promise<Result<true, GitError>> => {
  try {
    const git = getGit(projectPath)
    await git.add('.')
    await git.commit(message)
    return okOf(true)
  } catch (e) {
    return errOf('COMMIT_FAILED', e instanceof Error ? e.message : String(e))
  }
}

/**
 * add 指定文件 + commit。
 * 供 script:write 在 autoCommitOnSave 时调用。
 */
export const addAndCommit = async (
  projectPath: string,
  files: readonly string[],
  message: string
): Promise<Result<true, GitError>> => {
  try {
    if (!(await isRepo(projectPath))) {
      return errOf('NOT_INITIALIZED', '项目尚未 git init')
    }
    const git = getGit(projectPath)
    if (files.length > 0) {
      await git.add(files as string[])
    } else {
      await git.add('.')
    }
    await git.commit(message)
    return okOf(true)
  } catch (e) {
    return errOf('COMMIT_FAILED', e instanceof Error ? e.message : String(e))
  }
}

export const status = async (projectPath: string): Promise<Result<GitStatus, GitError>> => {
  try {
    if (!(await isRepo(projectPath))) {
      return okOf({ initialized: false, current: null, files: [] })
    }
    const git = getGit(projectPath)
    const s: StatusResult = await git.status()
    return okOf({
      initialized: true,
      current: s.current ?? null,
      files: s.files
    })
  } catch (e) {
    return errOf('STATUS_FAILED', e instanceof Error ? e.message : String(e))
  }
}

export const log = async (
  projectPath: string,
  maxCount = 50
): Promise<Result<GitCommit[], GitError>> => {
  try {
    if (!(await isRepo(projectPath))) {
      return okOf([])
    }
    const git = getGit(projectPath)
    const l: LogResult = await git.log({ maxCount })
    return okOf(
      l.all.map((entry) => ({
        hash: entry.hash,
        date: entry.date,
        message: entry.message,
        author: entry.author_name
      }))
    )
  } catch (e) {
    return errOf('LOG_FAILED', e instanceof Error ? e.message : String(e))
  }
}

export const diff = async (
  projectPath: string,
  filePath: string
): Promise<Result<string, GitError>> => {
  try {
    if (!(await isRepo(projectPath))) {
      return errOf('NOT_INITIALIZED', '项目尚未 git init')
    }
    const git = getGit(projectPath)
    const out = await git.diff(['--', filePath])
    return okOf(out)
  } catch (e) {
    return errOf('DIFF_FAILED', e instanceof Error ? e.message : String(e))
  }
}

/**
 * 任务前快照:add 全部 + commit(允许空提交),返回 HEAD 哈希。
 * 供 agent 安全闸在任务开始前打快照,失败时可 resetHard 回滚。
 */
export const snapshot = async (
  projectPath: string,
  message: string
): Promise<Result<string, GitError>> => {
  try {
    if (!(await isRepo(projectPath))) {
      return errOf('NOT_INITIALIZED', '项目尚未 git init')
    }
    const git = getGit(projectPath)
    await git.add('.')
    await git.commit(message, undefined, { '--allow-empty': null })
    const hash = (await git.revparse(['HEAD'])).trim()
    return okOf(hash)
  } catch (e) {
    return errOf('COMMIT_FAILED', e instanceof Error ? e.message : String(e))
  }
}

/**
 * 硬回滚到指定 ref(丢弃工作区改动),供 agent 任务失败 / 取消时回滚。
 */
export const resetHard = async (
  projectPath: string,
  ref: string
): Promise<Result<true, GitError>> => {
  try {
    if (!(await isRepo(projectPath))) {
      return errOf('NOT_INITIALIZED', '项目尚未 git init')
    }
    const git = getGit(projectPath)
    await git.reset(['--hard', ref])
    return okOf(true)
  } catch (e) {
    return errOf('RESET_FAILED', e instanceof Error ? e.message : String(e))
  }
}

export const gitService = {
  init,
  createInitialCommit,
  addAndCommit,
  status,
  log,
  diff,
  snapshot,
  resetHard
}