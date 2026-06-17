/**
 * asset:resolve handler 测试
 *
 * 验收:
 *  - 合法路径返 dataURL + mime + size
 *  - 路径穿越(../../../etc/passwd)拒绝
 *  - 绝对路径拒绝
 *  - 不存在文件返 NOT_FOUND
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveAsset } from './asset-handlers.js'

describe('resolveAsset', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'galide-asset-'))
    mkdirSync(join(tmpDir, 'assets', 'backgrounds'), { recursive: true })
    writeFileSync(join(tmpDir, 'assets', 'backgrounds', 'classroom.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('resolves a relative .png under projectRoot to dataURL', async () => {
    const r = await resolveAsset(tmpDir, 'assets/backgrounds/classroom.png')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.isDataUrl).toBe(true)
      expect(r.mime).toBe('image/png')
      expect(r.dataUrl).toMatch(/^data:image\/png;base64,/)
      expect(r.absolutePath).toContain('classroom.png')
    }
  })

  it('rejects path traversal (../etc/passwd)', async () => {
    const r = await resolveAsset(tmpDir, '../../../etc/passwd')
    expect(r.ok).toBe(false)
    expect(r.ok).toBe(false)
    if (r.ok === false) {
      expect(r.code).toBe('OUTSIDE_PROJECT')
    }
  })

  it('rejects absolute paths', async () => {
    const r = await resolveAsset(tmpDir, '/etc/passwd')
    expect(r.ok).toBe(false)
    expect(r.ok).toBe(false)
    if (r.ok === false) {
      expect(r.code).toBe('INVALID_PATH')
    }
  })

  it('returns NOT_FOUND for non-existent file', async () => {
    const r = await resolveAsset(tmpDir, 'assets/backgrounds/nonexistent.png')
    expect(r.ok).toBe(false)
    expect(r.ok).toBe(false)
    if (r.ok === false) {
      expect(r.code).toBe('NOT_FOUND')
    }
  })

  it('rejects relative paths that escape project (assets/../../etc)', async () => {
    const r = await resolveAsset(tmpDir, 'assets/../../etc/passwd')
    expect(r.ok).toBe(false)
    expect(r.ok).toBe(false)
    if (r.ok === false) {
      expect(r.code).toBe('OUTSIDE_PROJECT')
    }
  })
})
