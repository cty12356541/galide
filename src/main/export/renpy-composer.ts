/**
 * Ren'Py Composer (stub)
 *
 * TODO: 实现 Ren'Py 脚本生成
 * 目标格式: .rpy 文件
 * 关键语法:
 *   label scene_id:
 *     "对白" "角色"
 *     menu:
 *       "选项1":
 *         jump target_1
 *
 * 参考: https://www.renpy.org/doc/html/
 *
 * 当前实现返回空字符串占位,不抛异常
 * (core/conventions.yaml:35 所有 export 目标都通过 Composer 暴露)
 */

import type { Composer, ExportContext } from './composer.js'

export class RenpyComposer implements Composer<null, string> {
  readonly name = 'renpy' as const
  readonly defaultFilename = 'game/script.rpy'

  transform(_ctx: ExportContext): null {
    // TODO: 遍历 ctx.asts,生成 Ren'Py 中间表示
    return null
  }

  emit(_target: null, _ctx: ExportContext): string {
    // TODO: 输出 .rpy 源码
    return ''
  }
}
