/**
 * project-layout — 项目目录布局约定
 *
 * 规约: core/conventions.yaml「决策树在 scripts/*.gal」
 */
import { join } from 'node:path'

export const SCRIPTS_DIR = 'scripts' as const

/** 扁平 .gal 文件名白名单(禁止路径穿越) */
export const GAL_FILE_NAME_RE = /^[A-Za-z0-9_-]+\.gal$/

export const isGalScriptFileName = (name: string): boolean => GAL_FILE_NAME_RE.test(name)

export const scriptsDirAbs = (projectPath: string): string => join(projectPath, SCRIPTS_DIR)

export const galScriptAbs = (projectPath: string, fileName: string): string =>
  join(projectPath, SCRIPTS_DIR, fileName)

export const galScriptRel = (fileName: string): string => join(SCRIPTS_DIR, fileName)
