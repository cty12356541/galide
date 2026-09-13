/**
 * Electron Desktop Composer — T3-4 MVP
 *
 * 输出 = Web 导出产物(index.html + assets/,复用 WebComposer)+ shell/ 桌面壳:
 *   shell/main.cjs      Electron 主进程(galgame:// 协议映射,404 catch,路径穿越防护)
 *   shell/package.json  壳工程清单(name 来自 .galproj manifest,electron 锁 major)
 *   shell/README.md     中文说明(诚实声明:壳工程可运行,打包分发待 electron-builder)
 *
 * 与 WebComposer 是组合关系:transform/emit 委托,壳文件作为额外产物追加。
 */

import type { Composer, ExportContext, MultiFileOutput } from './composer.js'
import { WebComposer, type WebAst } from './web-composer.js'
import { loadManifestProjectName } from './shared.js'
import {
  buildShellMainCjs,
  buildShellPackageJson,
  buildShellReadme,
  toNpmPackageName
} from './electron-desktop-shell-template.js'

export interface ElectronDesktopAst {
  readonly web: WebAst
  readonly shellMainCjs: string
  readonly shellPackageJson: string
  readonly shellReadme: string
}

export class ElectronDesktopComposer implements Composer<ElectronDesktopAst, MultiFileOutput> {
  readonly name = 'electron-desktop' as const
  private readonly webComposer = new WebComposer()

  async transform(ctx: ExportContext): Promise<ElectronDesktopAst> {
    const web = await this.webComposer.transform(ctx)
    const projectName = await loadManifestProjectName(ctx.request.projectPath)
    return {
      web,
      shellMainCjs: buildShellMainCjs(),
      shellPackageJson: buildShellPackageJson(toNpmPackageName(projectName)),
      shellReadme: buildShellReadme(projectName)
    }
  }

  emit(target: ElectronDesktopAst, ctx: ExportContext): MultiFileOutput {
    const webOut = this.webComposer.emit(target.web, ctx)
    return {
      kind: 'multi',
      files: [
        ...webOut.files,
        { path: 'shell/main.cjs', content: target.shellMainCjs },
        { path: 'shell/package.json', content: target.shellPackageJson },
        { path: 'shell/README.md', content: target.shellReadme }
      ]
    }
  }
}
