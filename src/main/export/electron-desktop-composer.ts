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
    // 拒绝式语义:stub 不静默写空文件,抛错让 runComposer 调用方报 NOT_IMPLEMENTED
    throw new Error(`[${this.name}] export target "${this.name}" 尚未实现(NOT_IMPLEMENTED)`)
  }
}
