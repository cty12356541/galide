/**
 * 脚本文件服务 - 纯函数核心(可测)
 *
 * P1 修复:fileName 白名单校验 + fs 错误转 Result + git commit 失败不静默。
 * IPC handler (script-handlers.ts) 仅做 thin wrapper 转发到本模块,
 * 本模块对 fs / git 的依赖通过接口注入,便于 vitest 替换 mock。
 *
 * 规约: core/patterns.yaml:56-60 (Result<T, E> 而非抛异常)
 */
import type { Result } from '../../shared/dsl/types.js'
import {
  GAL_FILE_NAME_RE,
  galScriptAbs,
  galScriptRel,
  isGalScriptFileName,
  scriptsDirAbs
} from '../../shared/project-layout.js'
import type { GitPreferences } from '../../shared/preferences.js'

export type ScriptError =
  | { code: 'INVALID_FILENAME'; message: string }
  | { code: 'READ_FAILED'; message: string }
  | { code: 'WRITE_FAILED'; message: string }
  | { code: 'COMMIT_FAILED'; message: string }

export type ScriptFs = {
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  readDir: (path: string) => Promise<string[]>
}

export type ScriptGit = {
  addAndCommit: (
    projectPath: string,
    files: readonly string[],
    message: string
  ) => Promise<Result<true, { code: string; message: string }>>
}

/**
 * fileName 白名单:
 * - 仅允许扁平文件名(不含 '/'、不含 '..')
 * - 必须以 .gal 结尾
 * - 文件名主体仅允许 [A-Za-z0-9_-]
 *
 * 防御性:防止 path 穿越 (e.g. '../etc/passwd.gal') 或写到 scripts/ 外。
 */
export const validateFileName = (raw: unknown): Result<string, ScriptError> => {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, error: { code: 'INVALID_FILENAME', message: 'fileName must be non-empty' } }
  }
  if (!GAL_FILE_NAME_RE.test(raw)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_FILENAME',
        message: `fileName "${raw}" must match ${GAL_FILE_NAME_RE} (flat .gal file, no path traversal)`
      }
    }
  }
  return { ok: true, value: raw }
}

/** 把 Result<T, ScriptError> 转成错误对象用于回报 — 显式 narrow */
const errOf = (e: ScriptError): { ok: false; error: ScriptError } => ({ ok: false, error: e })

export type ScriptReadDeps = {
  fs: Pick<ScriptFs, 'readFile'>
}

export const readScript = async (
  projectPath: string,
  fileName: string,
  deps: ScriptReadDeps
): Promise<Result<string, ScriptError>> => {
  const v = validateFileName(fileName)
  if (v.ok !== true) return v
  try {
    const content = await deps.fs.readFile(galScriptAbs(projectPath, fileName))
    return { ok: true, value: content }
  } catch (e) {
    return errOf({ code: 'READ_FAILED', message: eMessage(e) })
  }
}

export type ScriptWriteDeps = {
  fs: Pick<ScriptFs, 'writeFile'>
  git: ScriptGit
  gitPrefs: GitPreferences
}

export const writeScript = async (
  projectPath: string,
  fileName: string,
  content: string,
  deps: ScriptWriteDeps
): Promise<Result<void, ScriptError>> => {
  const v = validateFileName(fileName)
  if (v.ok !== true) return v
  try {
    await deps.fs.writeFile(galScriptAbs(projectPath, fileName), content)
  } catch (e) {
    return errOf({ code: 'WRITE_FAILED', message: eMessage(e) })
  }
  if (deps.gitPrefs.autoCommitOnSave) {
    const relPath = galScriptRel(fileName)
    const r = await deps.git.addAndCommit(projectPath, [relPath], `update: ${fileName}`)
    if (r.ok !== true) {
      return errOf({ code: 'COMMIT_FAILED', message: `${r.error.code}: ${r.error.message}` })
    }
  }
  return { ok: true, value: undefined }
}

export type ScriptListDeps = {
  fs: Pick<ScriptFs, 'readDir'>
}

export const listScripts = async (
  projectPath: string,
  deps: ScriptListDeps
): Promise<Result<string[], ScriptError>> => {
  const dir = scriptsDirAbs(projectPath)
  try {
    const files = await deps.fs.readDir(dir)
    return { ok: true, value: files.filter((f) => isGalScriptFileName(f)) }
  } catch (e) {
    if (eHasCode(e, 'ENOENT')) return { ok: true, value: [] }
    return errOf({ code: 'READ_FAILED', message: eMessage(e) })
  }
}

const eMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const eHasCode = (e: unknown, code: string): boolean =>
  e instanceof Error && 'code' in e && (e as { code?: unknown }).code === code
