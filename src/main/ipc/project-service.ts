/**
 * Project 服务 - 纯函数核心(可测)
 *
 * P1 修复:git init/commit 失败回滚 .git,manifest.git 保持 false,
 * 失败对用户透明(返回 ok=true 但 manifest.git.initialized=false)。
 *
 * 同时加:name 校验 + trim + 长度上限(防御渲染层异常)。
 */
import { join } from 'node:path'
import type { ProjectManifest } from '../../shared/types.js'
import type { Result } from '../../shared/dsl/types.js'
import type { GitPreferences } from '../../shared/preferences.js'

export type ProjectError =
  | { code: 'INVALID_NAME'; message: string }
  | { code: 'CANCELED'; message: string }
  | { code: 'MKDIR_FAILED'; message: string }
  | { code: 'WRITE_FAILED'; message: string }
  | { code: 'GIT_INIT_FAILED'; message: string }
  | { code: 'GIT_COMMIT_FAILED'; message: string }

export type ProjectFs = {
  mkdir: (path: string, opts: { recursive: boolean }) => Promise<void>
  writeFile: (path: string, content: string) => Promise<void>
  readFile: (path: string) => Promise<string>
  rm: (path: string, opts: { recursive: boolean; force: boolean }) => Promise<void>
  exists: (path: string) => Promise<boolean>
}

export type ProjectGit = {
  init: (projectPath: string) => Promise<Result<true, { code: string; message: string }>>
  createInitialCommit: (projectPath: string, message: string) => Promise<Result<true, { code: string; message: string }>>
}

export type ProjectDialog = {
  showOpenDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>
}

export const MAX_NAME_LENGTH = 80

const sanitizeName = (raw: unknown): Result<string, ProjectError> => {
  if (typeof raw !== 'string') {
    return { ok: false, error: { code: 'INVALID_NAME', message: 'project name must be a string' } }
  }
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { ok: false, error: { code: 'INVALID_NAME', message: 'project name must not be empty' } }
  }
  // 控制字符 / NUL 防御
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(trimmed)) {
    return { ok: false, error: { code: 'INVALID_NAME', message: 'project name contains control characters' } }
  }
  const capped = trimmed.slice(0, MAX_NAME_LENGTH)
  return { ok: true, value: capped }
}

const ensureProjectLayout = async (projectPath: string, fs: ProjectFs): Promise<void> => {
  await fs.mkdir(join(projectPath, 'scripts'), { recursive: true })
  await fs.mkdir(join(projectPath, 'assets', 'characters'), { recursive: true })
  await fs.mkdir(join(projectPath, 'assets', 'backgrounds'), { recursive: true })
  await fs.mkdir(join(projectPath, 'assets', 'bgm'), { recursive: true })
}

const writeManifest = async (
  projectPath: string,
  manifest: ProjectManifest,
  fs: ProjectFs
): Promise<void> => {
  await fs.writeFile(join(projectPath, '.galproj'), JSON.stringify(manifest, null, 2))
}

export type CreateProjectDeps = {
  fs: ProjectFs
  git: ProjectGit
  dialog: ProjectDialog
  gitPrefs: GitPreferences
}

export type CreateProjectSuccess = {
  projectPath: string
  manifest: ProjectManifest
}

export const createProject = async (
  rawName: string,
  deps: CreateProjectDeps
): Promise<Result<CreateProjectSuccess, ProjectError>> => {
  const name = sanitizeName(rawName)
  if (name.ok !== true) return name

  const dialogResult = await deps.dialog.showOpenDialog()
  if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
    return { ok: false, error: { code: 'CANCELED', message: 'user canceled directory picker' } }
  }
  const projectPath = dialogResult.filePaths[0]!
  if (!projectPath) {
    return { ok: false, error: { code: 'CANCELED', message: 'no directory selected' } }
  }

  try {
    await ensureProjectLayout(projectPath, deps.fs)
  } catch (e) {
    return { ok: false, error: { code: 'MKDIR_FAILED', message: eMessage(e) } }
  }

  const now = new Date().toISOString()
  const manifest: ProjectManifest = {
    version: '0.1.0',
    name: name.value,
    createdAt: now,
    updatedAt: now,
    characters: [],
    assets: {
      characters: 'assets/characters',
      backgrounds: 'assets/backgrounds',
      bgm: 'assets/bgm'
    },
    git: { initialized: false }
  }

  try {
    await writeManifest(projectPath, manifest, deps.fs)
    await deps.fs.writeFile(join(projectPath, 'scripts', 'chapter1.gal'), '')
  } catch (e) {
    return { ok: false, error: { code: 'WRITE_FAILED', message: eMessage(e) } }
  }

  if (deps.gitPrefs.autoInit) {
    const initRes = await deps.git.init(projectPath)
    if (initRes.ok === true) {
      const commitRes = await deps.git.createInitialCommit(projectPath, deps.gitPrefs.initialCommitMessage)
      if (commitRes.ok === true) {
        manifest.git = { initialized: true }
        try {
          await writeManifest(projectPath, manifest, deps.fs)
        } catch {
          // 第二次写失败不应阻断 — 内存中 manifest.git 已正确,
          // 下次 project.save 会重新落盘
        }
      } else {
        // commit 失败 → 回滚 .git(可能已部分写入)
        try {
          await deps.fs.rm(join(projectPath, '.git'), { recursive: true, force: true })
        } catch {
          // rollback 失败也吞掉 — 用户后续可手动处理
        }
      }
    }
    // init 失败 → .git 不存在,无需回滚
  }

  return { ok: true, value: { projectPath, manifest } }
}

const eMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e))
