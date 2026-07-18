/**
 * project-handlers 安全测试 (tdd-07-security-openproject)
 *
 * 目标:
 *  - openProjectAtPath 必须主动拒绝路径遍历 (..)
 *  - openProjectAtPath 必须拒绝包含控制字符的路径
 *  - openProjectAtPath 必须拒绝空路径
 *  - 即使恶意路径下存在 .galproj 文件,也不允许被读取
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openProjectAtPath } from './project-handlers.js'

describe('openProjectAtPath security', () => {
  let tmpRoot: string
  let validProjectPath: string
  let _maliciousPath: string

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'galide-open-'))
    validProjectPath = join(tmpRoot, 'valid-project')
    mkdirSync(validProjectPath, { recursive: true })
    writeFileSync(
      join(validProjectPath, '.galproj'),
      JSON.stringify({
        version: '0.1.0',
        name: 'Valid',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        characters: [],
        assets: {
          characters: 'assets/characters',
          backgrounds: 'assets/backgrounds',
          bgm: 'assets/bgm'
        },
        git: { initialized: false }
      })
    )

    // 创建恶意路径的 .galproj（如果代码允许穿越，这里会被读取）
    const maliciousDir = join(tmpRoot, 'malicious-target')
    mkdirSync(maliciousDir, { recursive: true })
    writeFileSync(
      join(maliciousDir, '.galproj'),
      JSON.stringify({
        version: '0.1.0',
        name: 'Evil',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        characters: [],
        assets: {
          characters: 'assets/characters',
          backgrounds: 'assets/backgrounds',
          bgm: 'assets/bgm'
        },
        git: { initialized: false }
      })
    )
    _maliciousPath = join(validProjectPath, '..', 'malicious-target')
  })

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('opens a valid project path successfully', async () => {
    const r = await openProjectAtPath(validProjectPath)
    expect(r.ok).toBe(true)
    if (r.ok !== true) return
    expect(r.manifest?.name).toBe('Valid')
  })

  it('rejects path traversal (..)', async () => {
    const r = await openProjectAtPath(validProjectPath + '/../malicious-target')
    expect(r.ok).toBe(false)
    if (r.ok !== false) return
    expect(r.error).toContain('path traversal')
  })

  it('rejects path with control characters', async () => {
    const r = await openProjectAtPath(validProjectPath + '\x00evil')
    expect(r.ok).toBe(false)
    if (r.ok !== false) return
    expect(r.error).toContain('control')
  })

  it('rejects empty path', async () => {
    const r = await openProjectAtPath('')
    expect(r.ok).toBe(false)
    if (r.ok !== false) return
    expect(r.error).toMatch(/empty|invalid/i)
  })
})
