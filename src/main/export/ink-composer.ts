/**
 * Ink Composer (stub)
 *
 * TODO: 实现 Ink 脚本生成
 * 目标格式: .ink 文件
 * 关键语法:
 *   === scene_id ===
 *   角色: 对白
 *   * 选项文本 -> target
 *
 * 参考: https://github.com/inkle/ink
 *
 * 拒绝式语义:未实装,emit 抛 ExportError('NOT_IMPLEMENTED'),
 * 不静默写空文件。前端据 code 显示「该导出目标尚未实现」。
 */

import type { Composer, ExportContext } from './composer.js'
import { ExportError } from './composer.js'

export class InkComposer implements Composer<null, string> {
  readonly name = 'ink' as const
  readonly defaultFilename = 'story.ink'

  transform(_ctx: ExportContext): null {
    // TODO: 遍历 ctx.asts,生成 Ink knot/stitch 中间表示
    return null
  }

  emit(_target: null, _ctx: ExportContext): string {
    throw new ExportError('NOT_IMPLEMENTED', `[${this.name}] export target "${this.name}" 尚未实现`)
  }
}
