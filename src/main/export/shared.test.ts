/**
 * export/shared — loadManifestCharacters 错误处理测试
 * TDD-05: 当 .galproj 存在但格式无效时，应抛出 ExportError 而非静默返回 []
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadManifestCharacters } from './shared.js'
import { ExportError } from './composer.js'

const tmpRoots: string[] = []

afterEach(() => {
  while (tmpRoots.length) {
    const r = tmpRoots.pop()
    if (r) rmSync(r, { recursive: true, force: true })
  }
})

const makeProject = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'galide-shared-'))
  tmpRoots.push(root)
  return root
}

describe('loadManifestCharacters — manifest 错误处理', () => {
  it('当 .galproj 不存在时返回空数组', async () => {
    const projectPath = makeProject()
    const chars = await loadManifestCharacters(projectPath)
    expect(chars).toEqual([])
  })

  it('当 .galproj 存在但 JSON 无效时抛 ExportError(MANIFEST_INVALID)', async () => {
    const projectPath = makeProject()
    writeFileSync(join(projectPath, '.galproj'), '{ invalid json }', 'utf-8')
    await expect(loadManifestCharacters(projectPath)).rejects.toThrow(ExportError)
    try {
      await loadManifestCharacters(projectPath)
    } catch (e) {
      expect(e).toBeInstanceOf(ExportError)
      expect((e as ExportError).code).toBe('MANIFEST_INVALID')
    }
  })

  it('当 .galproj 存在但 schema 失败时抛 ExportError(MANIFEST_INVALID)', async () => {
    const projectPath = makeProject()
    writeFileSync(
      join(projectPath, '.galproj'),
      JSON.stringify({ version: '99.0.0', name: 'x' }),
      'utf-8'
    )
    await expect(loadManifestCharacters(projectPath)).rejects.toThrow(ExportError)
    try {
      await loadManifestCharacters(projectPath)
    } catch (e) {
      expect(e).toBeInstanceOf(ExportError)
      expect((e as ExportError).code).toBe('MANIFEST_INVALID')
    }
  })

  it('当 .galproj 存在且有效时返回已验证的 characters', async () => {
    const projectPath = makeProject()
    const manifest = {
      version: '0.1.0',
      name: 'Test Project',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      characters: [
        {
          id: 'c1',
          name: '小雪',
          description: 'd',
          personality: 'p',
          spriteSet: [{ state: 'default', path: 'assets/c.png' }]
        }
      ],
      assets: { characters: 'a', backgrounds: 'b', bgm: 'c' }
    }
    writeFileSync(join(projectPath, '.galproj'), JSON.stringify(manifest), 'utf-8')
    const chars = await loadManifestCharacters(projectPath)
    expect(chars).toHaveLength(1)
    expect(chars[0]?.id).toBe('c1')
    expect(chars[0]?.name).toBe('小雪')
    expect(chars[0]?.spriteSet).toHaveLength(1)
  })

  it('当 .galproj 存在但 characters 不是数组时抛 ExportError', async () => {
    const projectPath = makeProject()
    const manifest = {
      version: '0.1.0',
      name: 'Test',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      characters: 'not-an-array',
      assets: { characters: 'a', backgrounds: 'b', bgm: 'c' }
    }
    writeFileSync(join(projectPath, '.galproj'), JSON.stringify(manifest), 'utf-8')
    await expect(loadManifestCharacters(projectPath)).rejects.toThrow(ExportError)
  })
})
