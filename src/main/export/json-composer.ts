/**
 * JSON Composer (真实现)
 *
 * 规约依据: .style-spec/core/patterns.yaml#Parser-Composer
 *           "gal AST → TargetAST → TargetFile"
 *
 * 输出: { project: { projectPath, exportedAt }, scripts: AstEntry[] }
 * 用途: 调试 / 中间表示 / 第三方工具链。
 */

import type { Composer, ExportContext, JsonAst } from './composer.js'

export class JsonComposer implements Composer<JsonAst, string> {
  readonly name = 'json' as const
  readonly defaultFilename = 'script.json'

  transform(ctx: ExportContext): JsonAst {
    return {
      project: {
        projectPath: ctx.request.projectPath,
        exportedAt: new Date().toISOString()
      },
      scripts: ctx.asts.map((entry) => ({
        file: entry.file,
        ast: entry.ast
      }))
    }
  }

  emit(target: JsonAst, _ctx: ExportContext): string {
    return JSON.stringify(target, null, 2)
  }
}
