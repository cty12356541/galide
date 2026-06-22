/**
 * project-manifest — .galproj 读写 repository
 */
import { join } from 'node:path'
import type { Result } from '../../shared/dsl/types.js'
import type { ProjectManifest } from '../../shared/types.js'

export type ManifestError =
  | { code: 'READ_FAILED'; message: string }
  | { code: 'WRITE_FAILED'; message: string }

export const galprojPath = (projectPath: string): string => join(projectPath, '.galproj')

const eMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export const readGalproj = async (
  projectPath: string,
  readFile: (path: string) => Promise<string>
): Promise<Result<ProjectManifest, ManifestError>> => {
  try {
    const raw = await readFile(galprojPath(projectPath))
    return { ok: true, value: JSON.parse(raw) as ProjectManifest }
  } catch (e) {
    return { ok: false, error: { code: 'READ_FAILED', message: eMessage(e) } }
  }
}

export const writeGalproj = async (
  projectPath: string,
  manifest: ProjectManifest,
  writeFile: (path: string, content: string) => Promise<void>
): Promise<Result<void, ManifestError>> => {
  try {
    await writeFile(galprojPath(projectPath), JSON.stringify(manifest, null, 2))
    return { ok: true, value: undefined }
  } catch (e) {
    return { ok: false, error: { code: 'WRITE_FAILED', message: eMessage(e) } }
  }
}

export const patchGalproj = async (
  projectPath: string,
  patchFn: (manifest: ProjectManifest) => void,
  io: {
    readFile: (path: string) => Promise<string>
    writeFile: (path: string, content: string) => Promise<void>
  }
): Promise<Result<ProjectManifest, ManifestError>> => {
  const r = await readGalproj(projectPath, io.readFile)
  if (r.ok !== true) return r
  const manifest = r.value
  patchFn(manifest)
  manifest.updatedAt = new Date().toISOString()
  const w = await writeGalproj(projectPath, manifest, io.writeFile)
  if (w.ok !== true) return w
  return { ok: true, value: manifest }
}
