/**
 * Electron Desktop Composer (stub)
 *
 * TODO: 实现 Electron 桌面端打包配置
 * 目标格式: 完整 Electron 项目(目录)
 *   package.json
 *   main.js
 *   preload.js
 *   renderer/index.html  ← 复用 WebComposer 的输出
 *   renderer/scripts/    ← 复制 .gal
 *   renderer/assets/     ← 复制 assets
 *
 * 当前实现返回空字符串占位,不抛异常
 */

import type { Composer, ExportContext } from './composer.js'

export class ElectronDesktopComposer implements Composer<null, string> {
  readonly name = 'electron-desktop' as const
  readonly defaultFilename = 'package.json'

  transform(_ctx: ExportContext): null {
    // TODO: 复用 WebComposer 产物 + 包装成 Electron app
    return null
  }

  emit(_target: null, _ctx: ExportContext): string {
    // TODO: 输出 package.json 模板
    return ''
  }
}
