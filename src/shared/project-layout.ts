/**
 * project-layout — 项目目录布局约定
 *
 * 规约: core/conventions.yaml「决策树在 scripts/*.gal」
 */
import { join } from 'node:path'

export const SCRIPTS_DIR = 'scripts' as const

/**
 * .gal 相对路径白名单(相对于 scripts/,允许子目录嵌套,禁止路径穿越与冗余 scripts/ 前缀)
 * 例: 'chapter1.gal' ✓, 'act1/ch1.gal' ✓, '../evil.gal' ✗, 'scripts/ch1.gal' ✗
 */
export const GAL_FILE_NAME_RE = /^(?!scripts\/)(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.gal$/

export const isGalScriptFileName = (name: string): boolean => GAL_FILE_NAME_RE.test(name)

export const scriptsDirAbs = (projectPath: string): string => join(projectPath, SCRIPTS_DIR)

export const galScriptAbs = (projectPath: string, fileName: string): string =>
  join(projectPath, SCRIPTS_DIR, fileName)

export const galScriptRel = (fileName: string): string =>
  `${SCRIPTS_DIR}/${fileName.replace(/\\/g, '/')}`
