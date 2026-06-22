import { describe, it, expect } from 'vitest'
import { createFsFromVolume, Volume } from 'memfs'
import {
  assertExportableScripts,
  formatParseFailures,
  parseProjectScripts
} from './parse-project-scripts.js'
import { ExportError } from './composer.js'

const okGal = `## intro
背景: room
小雪: "你好"
`

describe('parse-project-scripts', () => {
  it('按文件名 sort 解析多个脚本', async () => {
    const vol = Volume.fromJSON({
      '/proj/scripts/b.gal': okGal,
      '/proj/scripts/a.gal': okGal
    })
    const mfs = createFsFromVolume(vol)
    const { asts, failures } = await parseProjectScripts('/proj/scripts', {
      readdir: (p) => mfs.promises.readdir(p) as Promise<string[]>,
      readFile: (p) => mfs.promises.readFile(p, 'utf-8') as Promise<string>
    })
    expect(failures).toHaveLength(0)
    expect(asts.map((a) => a.file)).toEqual(['a.gal', 'b.gal'])
  })

  it('收集 parse failures 不静默跳过', async () => {
    const vol = Volume.fromJSON({
      '/proj/scripts/good.gal': okGal,
      '/proj/scripts/bad.gal': 'BGM: assets/no-scene.mp3\n'
    })
    const mfs = createFsFromVolume(vol)
    const { asts, failures } = await parseProjectScripts('/proj/scripts', {
      readdir: (p) => mfs.promises.readdir(p) as Promise<string[]>,
      readFile: (p) => mfs.promises.readFile(p, 'utf-8') as Promise<string>
    })
    expect(asts).toHaveLength(1)
    expect(failures).toHaveLength(1)
    expect(failures[0]?.file).toBe('bad.gal')
  })

  it('空 scripts 目录返回空结果', async () => {
    const vol = Volume.fromJSON({ '/proj/scripts': null })
    const mfs = createFsFromVolume(vol)
    const { asts, failures } = await parseProjectScripts('/proj/scripts', {
      readdir: (p) => mfs.promises.readdir(p) as Promise<string[]>,
      readFile: (p) => mfs.promises.readFile(p, 'utf-8') as Promise<string>
    })
    expect(asts).toHaveLength(0)
    expect(failures).toHaveLength(0)
  })

  it('assertExportableScripts 对 failures 抛 PARSE_FAILED', () => {
    expect(() =>
      assertExportableScripts([], [{ file: 'a.gal', errors: [{ message: 'x', line: 1, column: 1, severity: 'error' }] }], 1)
    ).toThrow(ExportError)
    try {
      assertExportableScripts([], [{ file: 'a.gal', errors: [{ message: 'x', line: 1, column: 1, severity: 'error' }] }], 1)
    } catch (e) {
      expect(e).toBeInstanceOf(ExportError)
      expect((e as ExportError).code).toBe('PARSE_FAILED')
    }
  })

  it('assertExportableScripts 无脚本抛 NO_SCRIPTS', () => {
    expect(() => assertExportableScripts([], [], 0)).toThrow(ExportError)
    try {
      assertExportableScripts([], [], 0)
    } catch (e) {
      expect((e as ExportError).code).toBe('NO_SCRIPTS')
    }
  })

  it('formatParseFailures 含 file:line', () => {
    const msg = formatParseFailures([
      { file: 'a.gal', errors: [{ message: 'bad token', line: 2, column: 3, severity: 'error' }] }
    ])
    expect(msg).toContain('a.gal:2:3')
    expect(msg).toContain('bad token')
  })
})
