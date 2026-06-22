/**
 * searchProjectScripts — 扫描 scripts/*.gal 全文搜索
 *
 * readdir: ENOENT → 空结果;其他错误 → 抛 READ_FAILED
 */
import { join } from 'node:path'
import { isGalScriptFileName } from '../project-layout.js'

export type ScriptSearchHit = {
  file: string
  line: number
  column: number
  snippet: string
}

export type SearchProjectScriptsFs = {
  readdir: (path: string) => Promise<string[]>
  readFile: (path: string) => Promise<string>
}

const eHasCode = (e: unknown, code: string): boolean =>
  e instanceof Error && 'code' in e && (e as { code?: unknown }).code === code

export const searchProjectScripts = async (
  scriptsDir: string,
  query: string,
  fs: SearchProjectScriptsFs
): Promise<ScriptSearchHit[]> => {
  const q = query.trim()
  if (!q) return []

  const qLower = q.toLowerCase()
  let files: string[] = []
  try {
    files = (await fs.readdir(scriptsDir)).filter((f) => isGalScriptFileName(f)).sort()
  } catch (e) {
    if (eHasCode(e, 'ENOENT')) return []
    throw Object.assign(new Error(e instanceof Error ? e.message : String(e)), { code: 'READ_FAILED' })
  }

  const hits: ScriptSearchHit[] = []
  for (const file of files) {
    const content = await fs.readFile(join(scriptsDir, file))
    const lines = content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i] ?? ''
      const idx = lineText.toLowerCase().indexOf(qLower)
      if (idx === -1) continue
      const trimmed = lineText.trim()
      const snippet =
        trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed
      hits.push({
        file,
        line: i + 1,
        column: idx + 1,
        snippet
      })
    }
  }
  return hits
}
