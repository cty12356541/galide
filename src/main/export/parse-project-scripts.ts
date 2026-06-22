/**
 * parse-project-scripts — 扫描并解析项目 scripts/*.gal
 *
 * 规约: export 与 script:parseProject 共用,parse 失败 fail-loud。
 */
import { join } from 'node:path'
import { parse } from '../../shared/dsl/parser.js'
import type { ParseError, ScriptNode } from '../../shared/dsl/types.js'
import { isGalScriptFileName } from '../../shared/project-layout.js'
import type { AstEntry } from './composer.js'
import { ExportError } from './composer.js'

export type ScriptParseFailure = {
  readonly file: string
  readonly errors: readonly ParseError[]
}

export type ProjectScriptsFs = {
  readdir: (path: string) => Promise<string[]>
  readFile: (path: string) => Promise<string>
}

export type ParseProjectScriptsResult = {
  readonly asts: readonly AstEntry[]
  readonly failures: readonly ScriptParseFailure[]
}

export const formatParseFailures = (failures: readonly ScriptParseFailure[]): string =>
  failures
    .map(({ file, errors }) => {
      const lines = errors
        .filter((e) => e.severity === 'error')
        .map((e) => `  ${file}:${e.line}:${e.column} ${e.message}`)
      return lines.length > 0 ? lines.join('\n') : `  ${file}: parse failed`
    })
    .join('\n')

export const parseProjectScripts = async (
  scriptsDir: string,
  fs: ProjectScriptsFs
): Promise<ParseProjectScriptsResult> => {
  let files: string[] = []
  try {
    files = (await fs.readdir(scriptsDir)).filter((f) => isGalScriptFileName(f)).sort()
  } catch (e) {
    const code = e instanceof Error && 'code' in e ? (e as NodeJS.ErrnoException).code : undefined
    if (code === 'ENOENT') {
      return { asts: [], failures: [] }
    }
    throw e
  }

  const asts: AstEntry[] = []
  const failures: ScriptParseFailure[] = []

  for (const file of files) {
    const content = await fs.readFile(join(scriptsDir, file))
    const result = parse(content)
    if (result.ok === true) {
      asts.push({ file, ast: result.value })
    } else {
      failures.push({ file, errors: result.error })
    }
  }

  return { asts, failures }
}

/** 导出前校验:无脚本 / parse 失败 / 全失败 → ExportError */
export const assertExportableScripts = (
  asts: readonly AstEntry[],
  failures: readonly ScriptParseFailure[],
  galFileCount: number
): void => {
  if (galFileCount === 0) {
    throw new ExportError('NO_SCRIPTS', '项目中没有 scripts/*.gal 剧本文件')
  }
  if (failures.length > 0) {
    throw new ExportError(
      'PARSE_FAILED',
      `以下剧本解析失败,已中止导出:\n${formatParseFailures(failures)}`
    )
  }
  if (asts.length === 0) {
    throw new ExportError('NO_VALID_SCRIPTS', '没有可导出的有效剧本')
  }
}

export type { ScriptNode }
