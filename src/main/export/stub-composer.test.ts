/**
 * ExportError 语义测试(原 stub composer 拒绝语义测试)
 *
 * T3-4 起 electron-desktop 已实装(壳工程 MVP),不再抛 NOT_IMPLEMENTED;
 * 本文件保留 ExportError 类契约与 composer 注册接线断言。
 */
import { describe, it, expect } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ElectronDesktopComposer } from './electron-desktop-composer.js'
import { ExportError } from './composer.js'
import { getExportComposer } from './index.js'

describe('ExportError 契约', () => {
  it('ExportError 是 Error 子类且 name/code 稳定', () => {
    const e = new ExportError('NOT_IMPLEMENTED', 'msg')
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('ExportError')
    expect(e.code).toBe('NOT_IMPLEMENTED')
    expect(e.message).toBe('msg')
  })
})

describe('electron-desktop composer 接线(T3-4 实装)', () => {
  it('已注册到 export composer registry', () => {
    const composer = getExportComposer('electron-desktop')
    expect(composer).toBeDefined()
    expect(composer?.name).toBe('electron-desktop')
  })

  it('transform/emit 不再抛 NOT_IMPLEMENTED', async () => {
    const composer = new ElectronDesktopComposer()
    const outDir = join(tmpdir(), 'galide-stub-composer-test')
    const ctx = {
      request: { projectPath: '/nonexistent-galide-project', outputPath: outDir, target: 'electron-desktop' as const },
      asts: [],
      outputDir: outDir,
      progress: () => undefined
    }
    // .galproj 不存在 → 回退 basename,不抛错;空 asts → 空场景图
    const target = await composer.transform(ctx)
    const out = composer.emit(target, ctx)
    expect(out.kind).toBe('multi')
  })
})
