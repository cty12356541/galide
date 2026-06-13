/**
 * 角色服务 - 纯函数核心(可测)
 *
 * P2 修复:角色 CRUD 同样尊重 preferences.git.autoCommitOnSave,
 * commit `.galproj` 单文件。
 *
 * 规约: core/patterns.yaml:56-60 (Result<T, E>)
 */
import { join } from 'node:path'
import type { ProjectManifest } from '../../shared/types.js'
import type { Result } from '../../shared/dsl/types.js'
import type { GitPreferences } from '../../shared/preferences.js'

export type CharacterInput = {
  id: string
  name: string
  description: string
  personality: string
  spriteSet: { state: string; path: string }[]
}

export type CharacterError =
  | { code: 'READ_FAILED'; message: string }
  | { code: 'WRITE_FAILED'; message: string }
  | { code: 'COMMIT_FAILED'; message: string }

export type CharacterFs = {
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
}

export type CharacterGit = {
  addAndCommit: (
    projectPath: string,
    files: readonly string[],
    message: string
  ) => Promise<Result<true, { code: string; message: string }>>
}

const manifestPath = (projectPath: string): string => join(projectPath, '.galproj')

const readManifest = async (
  projectPath: string,
  fs: CharacterFs
): Promise<Result<ProjectManifest, CharacterError>> => {
  try {
    const raw = await fs.readFile(manifestPath(projectPath))
    return { ok: true, value: JSON.parse(raw) as ProjectManifest }
  } catch (e) {
    return { ok: false, error: { code: 'READ_FAILED', message: eMessage(e) } }
  }
}

const writeManifest = async (
  projectPath: string,
  manifest: ProjectManifest,
  fs: CharacterFs
): Promise<Result<void, CharacterError>> => {
  try {
    await fs.writeFile(manifestPath(projectPath), JSON.stringify(manifest, null, 2))
    return { ok: true, value: undefined }
  } catch (e) {
    return { ok: false, error: { code: 'WRITE_FAILED', message: eMessage(e) } }
  }
}

export type CharacterDeps = {
  fs: CharacterFs
  git: CharacterGit
  gitPrefs: GitPreferences
}

const maybeCommit = async (
  projectPath: string,
  displayName: string,
  action: 'create' | 'update' | 'delete',
  deps: CharacterDeps
): Promise<Result<void, CharacterError>> => {
  if (!deps.gitPrefs.autoCommitOnSave) return { ok: true, value: undefined }
  const r = await deps.git.addAndCommit(projectPath, ['.galproj'], `character: ${action} ${displayName}`)
  if (r.ok !== true) {
    return {
      ok: false,
      error: { code: 'COMMIT_FAILED', message: `${r.error.code}: ${r.error.message}` }
    }
  }
  return { ok: true, value: undefined }
}

export const createCharacter = async (
  projectPath: string,
  character: CharacterInput,
  deps: CharacterDeps
): Promise<Result<void, CharacterError>> => {
  const read = await readManifest(projectPath, deps.fs)
  if (read.ok !== true) return read
  const manifest = read.value
  manifest.characters = [...manifest.characters.filter((c) => c.id !== character.id), character]
  manifest.updatedAt = new Date().toISOString()
  const write = await writeManifest(projectPath, manifest, deps.fs)
  if (write.ok !== true) return write
  const commit = await maybeCommit(projectPath, character.name, 'create', deps)
  if (commit.ok !== true) return commit
  return { ok: true, value: undefined }
}

export const updateCharacter = async (
  projectPath: string,
  character: CharacterInput,
  deps: CharacterDeps
): Promise<Result<void, CharacterError>> => {
  const read = await readManifest(projectPath, deps.fs)
  if (read.ok !== true) return read
  const manifest = read.value
  manifest.characters = manifest.characters.map((c) => (c.id === character.id ? character : c))
  manifest.updatedAt = new Date().toISOString()
  const write = await writeManifest(projectPath, manifest, deps.fs)
  if (write.ok !== true) return write
  const commit = await maybeCommit(projectPath, character.name, 'update', deps)
  if (commit.ok !== true) return commit
  return { ok: true, value: undefined }
}

export const deleteCharacter = async (
  projectPath: string,
  id: string,
  deps: CharacterDeps
): Promise<Result<void, CharacterError>> => {
  const read = await readManifest(projectPath, deps.fs)
  if (read.ok !== true) return read
  const manifest = read.value
  const removed = manifest.characters.find((c) => c.id === id)
  manifest.characters = manifest.characters.filter((c) => c.id !== id)
  manifest.updatedAt = new Date().toISOString()
  const write = await writeManifest(projectPath, manifest, deps.fs)
  if (write.ok !== true) return write
  const commit = await maybeCommit(projectPath, removed?.name ?? id, 'delete', deps)
  if (commit.ok !== true) return commit
  return { ok: true, value: undefined }
}

export type ListCharactersResult = {
  ok: true
  value: { characters: CharacterInput[] }
} | { ok: false; error: string; code?: string }

export const listCharacters = async (
  projectPath: string,
  deps: Pick<CharacterDeps, 'fs'>
): Promise<ListCharactersResult> => {
  const read = await readManifest(projectPath, deps.fs)
  if (read.ok !== true) return { ok: false, error: read.error.message, code: read.error.code }
  return { ok: true, value: { characters: read.value.characters } }
}

const eMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e))
