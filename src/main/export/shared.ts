/**
 * export/shared — Ren'Py / Ink composer 共用抽象
 */
import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import type { SceneNode, ScriptNode } from '../../shared/dsl/types.js'
import { collectNodes } from '../../shared/dsl/visitor.js'
import type { AstEntry } from './composer.js'
import { ExportError } from './composer.js'
import { parseManifest } from '../../shared/manifest-schema.js'

export type ManifestCharacter = {
  id: string
  name: string
  spriteSet?: { state: string; path: string }[]
}

/** 将 gal 标识符转为 export 目标安全 id(保留 CJK,替换标点) */
export const sanitizeExportId = (id: string, numberPrefix: string): string => {
  const cleaned = id
    .replace(/[·\s-]+/g, '_')
    .replace(/[^\w\u4e00-\u9fff]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  if (!cleaned) return 'unnamed'
  if (/^[0-9]/.test(cleaned)) return `${numberPrefix}_${cleaned}`
  return cleaned
}

export const collectJumpTargetIds = (scripts: readonly ScriptNode[]): Set<string> => {
  const ids = new Set<string>()
  for (const script of scripts) {
    for (const scene of collectNodes(script, (n): n is SceneNode => n.type === 'scene')) {
      ids.add(scene.id)
    }
    for (const marker of collectNodes(script, (n) => n.type === 'marker')) {
      if (marker.type === 'marker') ids.add(marker.id)
    }
    for (const choice of collectNodes(script, (n) => n.type === 'choice')) {
      if (choice.type === 'choice') {
        for (const opt of choice.options) {
          if (opt.target) ids.add(opt.target)
        }
      }
    }
    for (const goto of collectNodes(script, (n) => n.type === 'goto')) {
      if (goto.type === 'goto') ids.add(goto.target)
    }
  }
  return ids
}

export const buildUniqueIdMap = (
  ids: Iterable<string>,
  sanitize: (id: string) => string
): Map<string, string> => {
  const map = new Map<string, string>()
  const used = new Set<string>()
  for (const id of ids) {
    const base = sanitize(id)
    let candidate = base
    let n = 2
    while (used.has(candidate)) {
      candidate = `${base}_${n}`
      n++
    }
    used.add(candidate)
    map.set(id, candidate)
  }
  return map
}

export const loadManifestCharacters = async (
  projectPath: string
): Promise<ManifestCharacter[]> => {
  try {
    const raw = await fs.readFile(join(projectPath, '.galproj'), 'utf-8')
    const result = parseManifest(raw)
    if (!result.ok) {
      throw new ExportError('MANIFEST_INVALID', result.error.message)
    }
    return result.value.characters
  } catch (err) {
    if (err instanceof ExportError) throw err
    if (err instanceof Error && 'code' in err && (err as { code: unknown }).code === 'ENOENT') {
      return []
    }
    throw new ExportError(
      'MANIFEST_READ_FAILED',
      err instanceof Error ? err.message : String(err)
    )
  }
}

export const toCharacterVar = (displayName: string): string =>
  `char_${sanitizeExportId(displayName, 'n')}`

/**
 * 读取 .galproj 的项目显示名(供桌面壳 package.json / README 使用)。
 * - .galproj 不存在 → 回退项目目录 basename
 * - .galproj 存在但无效 → 抛 ExportError(MANIFEST_INVALID),与 loadManifestCharacters 一致
 */
export const loadManifestProjectName = async (projectPath: string): Promise<string> => {
  const fallback = basename(projectPath) || 'galide-game'
  try {
    const raw = await fs.readFile(join(projectPath, '.galproj'), 'utf-8')
    const result = parseManifest(raw)
    if (!result.ok) {
      throw new ExportError('MANIFEST_INVALID', result.error.message)
    }
    return result.value.name
  } catch (err) {
    if (err instanceof ExportError) throw err
    if (err instanceof Error && 'code' in err && (err as { code: unknown }).code === 'ENOENT') {
      return fallback
    }
    throw new ExportError(
      'MANIFEST_READ_FAILED',
      err instanceof Error ? err.message : String(err)
    )
  }
}

export const countScenesInAsts = (asts: readonly AstEntry[]): number => {
  let count = 0
  for (const { ast } of asts) {
    count += collectNodes(ast, (n): n is SceneNode => n.type === 'scene').length
  }
  return count
}
