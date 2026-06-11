/**
 * JSON Composer (stub)
 *
 * TODO: 实现 gal AST 的 JSON 序列化
 * 目标格式: .json 文件
 * 用途: 调试 / 中间表示 / 第三方工具链
 *
 * 当前实现返回空字符串占位,不抛异常
 */

import type { Composer, ExportContext } from './composer.js'

export class JsonComposer implements Composer<null, string> {
  readonly name = 'json' as const
  readonly defaultFilename = 'script.json'

  transform(_ctx: ExportContext): null {
    // TODO: ctx.asts 已 parse 好,直接 JSON.stringify 即可
    return null
  }

  emit(_target: null, _ctx: ExportContext): string {
    // TODO: 输出 JSON.stringify(ctx.asts, null, 2)
    return ''
  }
}
