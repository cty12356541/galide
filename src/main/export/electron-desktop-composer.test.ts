/**
 * Electron Desktop Composer 测试 — T3-4 MVP
 *
 * 验证输出树(Web 产物 + shell/)与壳 main.cjs 的关键机制字符串:
 * 自定义 scheme 注册、404 catch、路径穿越防护、窗口尺寸、安全 webPreferences。
 * 静态断言为默认;真实 Electron 冒烟见 electron-desktop-shell.e2e.test.ts(env 门控)。
 */
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ElectronDesktopComposer } from './electron-desktop-composer.js'
import { ExportError, runComposer } from './composer.js'
import type { ExportContext, AstEntry } from './composer.js'
import type { DialogueNode, SceneNode, ScriptNode } from '../../shared/dsl/types.js'

const makeDialogue = (character: string, text: string): DialogueNode => ({
  line: 1,
  column: 1,
  type: 'dialogue',
  character,
  lines: [text]
})

const makeScene = (id: string, children: SceneNode['children']): SceneNode => ({
  line: 1,
  column: 1,
  type: 'scene',
  id,
  children
})

const makeAst = (scenes: SceneNode[]): ScriptNode => ({
  line: 1,
  column: 1,
  type: 'script',
  children: scenes,
  errors: []
})

const tmpRoot = mkdtempSync(join(tmpdir(), 'galide-desktop-'))

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

let fixtureSeq = 0

/** 搭一个临时 fixture 项目(可选 manifest + assets),返回 ctx */
const makeFixture = (options: { manifestName?: string; invalidManifest?: boolean } = {}): ExportContext => {
  fixtureSeq += 1
  const projectPath = join(tmpRoot, `project-${fixtureSeq}`)
  const outputDir = join(tmpRoot, `out-${fixtureSeq}`)
  mkdirSync(join(projectPath, 'assets', 'sprites'), { recursive: true })
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(projectPath, 'assets', 'sprites', 'yuki.png'), 'PNG', 'utf-8')
  if (options.invalidManifest) {
    writeFileSync(join(projectPath, '.galproj'), '{ invalid json }', 'utf-8')
  } else if (options.manifestName !== undefined) {
    writeFileSync(
      join(projectPath, '.galproj'),
      JSON.stringify({
        version: '0.1.0',
        name: options.manifestName,
        createdAt: '2026-07-19T00:00:00.000Z',
        updatedAt: '2026-07-19T00:00:00.000Z',
        characters: [],
        assets: { characters: 'assets/sprites', backgrounds: 'assets/backgrounds', bgm: 'assets/bgm' }
      }),
      'utf-8'
    )
  }
  const asts: readonly AstEntry[] = [
    { file: 'main.gal', ast: makeAst([makeScene('s1', [makeDialogue('小雪', '你好')])]) }
  ]
  return {
    request: { projectPath, target: 'electron-desktop', outputPath: outputDir },
    asts,
    outputDir,
    progress: () => {}
  }
}

describe('ElectronDesktopComposer', () => {
  it('runComposer 写出完整产物树: index.html + assets/ + shell/{main.cjs,package.json,README.md}', async () => {
    const ctx = makeFixture({ manifestName: '樱花物语' })
    const composer = new ElectronDesktopComposer()
    const { paths } = await runComposer(composer, ctx)

    expect(existsSync(join(ctx.outputDir, 'index.html'))).toBe(true)
    expect(existsSync(join(ctx.outputDir, 'assets', 'sprites', 'yuki.png'))).toBe(true)
    expect(existsSync(join(ctx.outputDir, 'shell', 'main.cjs'))).toBe(true)
    expect(existsSync(join(ctx.outputDir, 'shell', 'package.json'))).toBe(true)
    expect(existsSync(join(ctx.outputDir, 'shell', 'README.md'))).toBe(true)
    // paths 只含 emit 写盘的文件(index.html + 3 个壳文件);
    // assets/ 由 WebComposer.transform 经 fs.cp 复制,不在 emit 清单里
    expect(paths.length).toBe(4)
  })

  it('index.html 与 Web 导出同源(VM_GRAPH 内联播放器)', async () => {
    const ctx = makeFixture({ manifestName: 'demo' })
    await runComposer(new ElectronDesktopComposer(), ctx)
    const html = readFileSync(join(ctx.outputDir, 'index.html'), 'utf-8')
    expect(html).toContain('VM_GRAPH')
    expect(html).toContain('你好')
  })

  it('shell/main.cjs 含 spike 验证过的关键机制(scheme/404/穿越防护/安全偏好)', async () => {
    const ctx = makeFixture({ manifestName: 'demo' })
    await runComposer(new ElectronDesktopComposer(), ctx)
    const main = readFileSync(join(ctx.outputDir, 'shell', 'main.cjs'), 'utf-8')

    expect(main).toContain('registerSchemesAsPrivileged')
    expect(main).toContain("scheme: 'galgame'")
    expect(main).toContain('supportFetchAPI: true')
    expect(main).toContain('stream: true')
    expect(main).toContain("protocol.handle('galgame'")
    expect(main).toContain('pathToFileURL')
    expect(main).toContain('status: 404')
    expect(main).toContain('status: 403')
    expect(main).toContain('path.normalize')
    expect(main).toContain('startsWith(EXPORT_DIR + path.sep)')
    expect(main).toContain('width: 1280')
    expect(main).toContain('height: 720')
    expect(main).toContain('nodeIntegration: false')
    expect(main).toContain('contextIsolation: true')
    expect(main).toContain('persist:galgame')
    expect(main).toContain('autoplayPolicy')
    expect(main).toContain('galgame://app/index.html')
  })

  it('shell/package.json: name 取自 manifest(清洗为 npm 安全名),electron 锁 major 35', async () => {
    const ctx = makeFixture({ manifestName: '樱花物语 Sakura' })
    await runComposer(new ElectronDesktopComposer(), ctx)
    const pkg = JSON.parse(readFileSync(join(ctx.outputDir, 'shell', 'package.json'), 'utf-8')) as {
      name: string
      main: string
      devDependencies: Record<string, string>
    }
    expect(pkg.name).toBe('sakura')
    expect(pkg.main).toBe('main.cjs')
    expect(pkg.devDependencies['electron']).toMatch(/^\^35\./)
  })

  it('shell/README.md 为中文且诚实说明: 壳工程可运行,打包分发待 electron-builder', async () => {
    const ctx = makeFixture({ manifestName: '樱花物语' })
    await runComposer(new ElectronDesktopComposer(), ctx)
    const readme = readFileSync(join(ctx.outputDir, 'shell', 'README.md'), 'utf-8')
    expect(readme).toContain('樱花物语')
    expect(readme).toContain('壳工程')
    expect(readme).toContain('electron-builder')
    expect(readme).toContain('尚未生成可分发的安装包')
  })

  it('.galproj 缺失时回退项目目录 basename,不抛错', async () => {
    const ctx = makeFixture()
    const target = await new ElectronDesktopComposer().transform(ctx)
    expect(target.shellReadme).toContain(`project-${fixtureSeq}`)
    const pkg = JSON.parse(target.shellPackageJson) as { name: string }
    expect(pkg.name).toBe(`project-${fixtureSeq}`)
  })

  it('.galproj 无效时抛 ExportError(MANIFEST_INVALID)', async () => {
    const ctx = makeFixture({ invalidManifest: true })
    const composer = new ElectronDesktopComposer()
    await expect(composer.transform(ctx)).rejects.toThrow(ExportError)
    try {
      await composer.transform(ctx)
    } catch (err) {
      expect((err as ExportError).code).toBe('MANIFEST_INVALID')
    }
  })

  it('emit 为 multi 输出且壳文件路径挂在 shell/ 下', async () => {
    const ctx = makeFixture({ manifestName: 'demo' })
    const composer = new ElectronDesktopComposer()
    const target = await composer.transform(ctx)
    const out = composer.emit(target, ctx)
    expect(out.kind).toBe('multi')
    if (out.kind === 'multi') {
      const paths = out.files.map((f) => f.path)
      expect(paths).toContain('index.html')
      expect(paths).toContain('shell/main.cjs')
      expect(paths).toContain('shell/package.json')
      expect(paths).toContain('shell/README.md')
    }
  })
})
