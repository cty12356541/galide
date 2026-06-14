/**
 * Export Composer — core/patterns.yaml:6-15 Parser-Composer Pipeline
 * 核心规约:gal AST → TargetAST → TargetFile
 *
 * Composer 是 OOP 风格(类实现 interface),
 * 与 visitor 的函数式风格形成统一:
 * - visitor 处理 AST 内部遍历,纯函数,无副作用
 * - composer 处理 AST → 目标格式的两阶段转换(transform + emit),带副作用(写文件)
 *
 * emit 的返回类型约定:
 * - `string`           : 单文件输出,runner 写入 `<outputDir>/<defaultFilename ?? `${name}.txt`>`
 * - `{ path, content }[]` : 多文件输出,runner 按 path 写盘
 *
 * 所有 export 目标都通过 Composer 暴露(core/conventions.yaml:35)。
 */

import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import type { ScriptNode } from '../../shared/dsl/types.js'
import type { ExportProgress, ExportRequest, ExportTarget } from '../../shared/types.js'

/**
 * Composer 执行上下文。
 * - request: 原始 ExportRequest(projectPath / outputPath / target)
 * - asts: 已 parse 的所有 .gal 脚本(按文件分组)
 * - outputDir: 已 mkdir 的输出根目录(等于 request.outputPath)
 * - progress: 上报进度的回调
 */
export interface ExportContext {
  readonly request: ExportRequest
  readonly asts: readonly AstEntry[]
  readonly outputDir: string
  readonly progress: (p: ExportProgress) => void
}

export interface AstEntry {
  readonly file: string
  readonly ast: ScriptNode
}

/**
 * JsonComposer 专属 AST: { project: {...}, scripts: AstEntry[] }
 * 调试 / 中间表示用途(不参与 renpy/ink/web 等 runtime 实际消费)
 */
export interface JsonAst {
  readonly project: {
    readonly projectPath: string
    readonly exportedAt: string
  }
  readonly scripts: readonly AstEntry[]
}

/**
 * 单文件输出结果。filename 为相对 outputDir 的文件名。
 * 内容即文件正文(UTF-8 字符串)。
 */
export interface SingleFileOutput {
  readonly kind: 'single'
  readonly filename: string
  readonly content: string
}

/** 多文件输出结果,每个文件相对 outputDir 写盘。 */
export interface MultiFileOutput {
  readonly kind: 'multi'
  readonly files: ReadonlyArray<{ readonly path: string; readonly content: string }>
}

/**
 * Composer 接口。
 * - `name` 必须唯一,与 ExportTarget 一一对应
 * - `defaultFilename` 当 emit 返回裸字符串时,runner 用它作为输出文件名
 * - `transform` 把所有 .gal AST 转为目标中间表示(TAst)
 * - `emit` 把目标中间表示序列化为 string | SingleFileOutput | MultiFileOutput
 *
 * 子类可同时返回 SingleFileOutput / MultiFileOutput(都是字符串字面量),
 * 但 emit 的返回类型 TAst → TOut 是具体协变。
 */
export interface Composer<TAst = unknown, TOut = unknown> {
  readonly name: ExportTarget
  readonly defaultFilename?: string
  transform(ctx: ExportContext): TAst | Promise<TAst>
  emit(target: TAst, ctx: ExportContext): TOut | Promise<TOut>
}

/**
 * Composer 注册表。
 * 通过 createComposerRegistry() 创建,通过 register / get / list 操作。
 */
export interface ExportComposerRegistry {
  register<C extends Composer<unknown, unknown>>(composer: C): void
  get(name: ExportTarget): Composer<unknown, unknown> | undefined
  list(): readonly ExportTarget[]
}

export const createComposerRegistry = (): ExportComposerRegistry => {
  const composers = new Map<ExportTarget, Composer<unknown, unknown>>()
  return {
    register<C extends Composer<unknown, unknown>>(composer: C): void {
      if (composers.has(composer.name)) {
        throw new Error(`Composer "${composer.name}" already registered`)
      }
      composers.set(composer.name, composer as Composer<unknown, unknown>)
    },
    get(name: ExportTarget): Composer<unknown, unknown> | undefined {
      return composers.get(name)
    },
    list(): readonly ExportTarget[] {
      return Array.from(composers.keys())
    }
  }
}

/**
 * emit 的契约:返回字符串(裸)或 SingleFileOutput / MultiFileOutput。
 * - string: 当作单文件,filename 来自 `composer.defaultFilename` 否则 `<name>.txt`
 * - SingleFileOutput: filename 显式指定
 * - MultiFileOutput: 多文件
 */
export type EmitResult = string | SingleFileOutput | MultiFileOutput

export interface ComposeResult {
  readonly paths: readonly string[]
}

/**
 * 统一执行入口:运行 composer 的 transform + emit,然后把结果写盘。
 * 这是 export-handlers 调用 composer 的唯一路径。
 * 接受任意 Composer<TOut> — emit 结果在运行时检查是否符合 EmitResult。
 */
export const runComposer = async (
  composer: Composer<unknown, unknown>,
  ctx: ExportContext
): Promise<ComposeResult> => {
  const target = await composer.transform(ctx)
  const result = (await composer.emit(target, ctx)) as EmitResult
  const written: string[] = []
  if (typeof result === 'string') {
    const filename = composer.defaultFilename ?? `${composer.name}.txt`
    const out = join(ctx.outputDir, filename)
    await fs.writeFile(out, result, 'utf-8')
    written.push(out)
  } else if (result.kind === 'single') {
    const out = join(ctx.outputDir, result.filename)
    await fs.mkdir(dirname(out), { recursive: true })
    await fs.writeFile(out, result.content, 'utf-8')
    written.push(out)
  } else {
    for (const f of result.files) {
      const out = join(ctx.outputDir, f.path)
      await fs.mkdir(dirname(out), { recursive: true })
      await fs.writeFile(out, f.content, 'utf-8')
      written.push(out)
    }
  }
  return { paths: written }
}
