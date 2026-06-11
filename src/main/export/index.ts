/**
 * Export 模块入口
 *
 * 注册所有 Composer 到全局 registry,提供 `getExportComposer(name)` 查表。
 * export-handlers 通过这个函数获取 composer,而不是直接 import 具体实现
 * (实现 core/patterns.yaml:6-15 Parser-Composer Pipeline 的"正交")。
 */

import {
  createComposerRegistry,
  runComposer,
  type ExportComposerRegistry,
  type Composer,
  type AstEntry,
  type ExportContext
} from './composer.js'
import { WebComposer } from './web-composer.js'
import { RenpyComposer } from './renpy-composer.js'
import { InkComposer } from './ink-composer.js'
import { JsonComposer } from './json-composer.js'
import { ElectronDesktopComposer } from './electron-desktop-composer.js'
import type { ExportTarget } from '../../shared/types.js'

const registry: ExportComposerRegistry = createComposerRegistry()

const register = <C extends Composer<unknown, unknown>>(composer: C): void => {
  registry.register(composer)
}

register(new WebComposer())
register(new RenpyComposer())
register(new InkComposer())
register(new JsonComposer())
register(new ElectronDesktopComposer())

/** 查表:按 ExportTarget 获取 Composer(可能 undefined — 表示目标未注册) */
export const getExportComposer = (name: ExportTarget): Composer<unknown, unknown> | undefined =>
  registry.get(name)

/** 列出所有已注册的 export 目标 */
export const listExportTargets = (): readonly ExportTarget[] => registry.list()

export { registry as exportComposerRegistry, runComposer }
export type { AstEntry, ExportContext }
