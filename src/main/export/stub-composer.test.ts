/**
 * Stub Composer 拒绝语义测试(功能即岛后续批次)
 *
 * 验证:ink / renpy / electron-desktop 三个 stub composer 的 emit
 * 抛 ExportError('NOT_IMPLEMENTED'),且 code 端到端可提取
 * (export-handlers catch 据此透传给前端)。
 */
import { describe, it, expect } from 'vitest'
import { InkComposer } from './ink-composer.js'
import { RenpyComposer } from './renpy-composer.js'
import { ElectronDesktopComposer } from './electron-desktop-composer.js'
import { ExportError, runComposer } from './composer.js'
import type { ExportContext, AstEntry } from './composer.js'
import type { ScriptNode } from '../../shared/dsl/types.js'

const emptyCtx: ExportContext = {
  request: {
    projectPath: '/p',
    outputPath: '/tmp/out',
    target: 'ink'
  },
  asts: [] as readonly AstEntry[],
  outputDir: '/tmp/out',
  progress: () => undefined
} as unknown as ExportContext

const stubScript: ScriptNode = {
  type: 'program',
  body: []
} as unknown as ScriptNode

describe('stub composer 拒绝语义', () => {
  it.each([
    ['ink', new InkComposer()],
    ['renpy', new RenpyComposer()],
    ['electron-desktop', new ElectronDesktopComposer()]
  ])('%s 的 emit 抛 ExportError(NOT_IMPLEMENTED)', (_name, composer) => {
    expect(() => composer.emit(null, emptyCtx)).toThrow(ExportError)
    try {
      composer.emit(null, emptyCtx)
    } catch (err) {
      expect((err as ExportError).code).toBe('NOT_IMPLEMENTED')
      expect((err as ExportError).message).toContain('尚未实现')
    }
  })

  it('runComposer 对 stub composer 透传 NOT_IMPLEMENTED(端到端)', async () => {
    const composer = new InkComposer()
    const ctx: ExportContext = {
      request: { projectPath: '/p', outputPath: '/tmp/out', target: 'ink' },
      asts: [{ file: 'a.gal', ast: stubScript }] as readonly AstEntry[],
      outputDir: '/tmp/out',
      progress: () => undefined
    }
    await expect(runComposer(composer, ctx)).rejects.toThrow()
    try {
      await runComposer(composer, ctx)
    } catch (err) {
      expect((err as ExportError).code).toBe('NOT_IMPLEMENTED')
    }
  })

  it('ExportError 是 Error 子类且 name/code 稳定', () => {
    const e = new ExportError('NOT_IMPLEMENTED', 'msg')
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('ExportError')
    expect(e.code).toBe('NOT_IMPLEMENTED')
    expect(e.message).toBe('msg')
  })
})
