/**
 * key-store 单测
 * 规约: layers/main-process/conventions.yaml:26 — API Key 加密存储,
 *       启动时必须能复用或生成 token,损坏的 token 触发重生成。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// electron 的 app.getPath 需要 mock,把它移到最前面
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn()
  }
}))

// 静态 import 放在 vi.mock 之后
import { app } from 'electron'
const { deriveEncryptionKey, deriveEncryptionKeyFromFs } = await import('./key-store.js')

afterEach(() => {
  vi.clearAllMocks()
})

const tmpRoots: string[] = []
afterEach(() => {
  while (tmpRoots.length) {
    const r = tmpRoots.pop()
    if (r) rmSync(r, { recursive: true, force: true })
  }
})

const makeFs = (dir: string) => ({
  keychainPath: join(dir, 'galide-keychain.token'),
  exists: () => existsSync(join(dir, 'galide-keychain.token')),
  read: () => readFileSync(join(dir, 'galide-keychain.token'), 'utf-8'),
  mode: () => statSync(join(dir, 'galide-keychain.token')).mode & 0o777
})

describe('deriveEncryptionKeyFromFs', () => {
  it('generates new token when file does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'galide-key-'))
    tmpRoots.push(dir)
    const fs = makeFs(dir)
    expect(fs.exists()).toBe(false)
    const token = deriveEncryptionKeyFromFs({ keychainPath: fs.keychainPath })
    expect(token.length).toBeGreaterThanOrEqual(32)
    expect(fs.exists()).toBe(true)
    // 文件权限 0o600
    expect(fs.mode()).toBe(0o600)
  })

  it('reuses existing token when length >= 32', () => {
    const dir = mkdtempSync(join(tmpdir(), 'galide-key-'))
    tmpRoots.push(dir)
    const fs = makeFs(dir)
    const existing = 'a'.repeat(40)
    writeFileSync(fs.keychainPath, existing)
    const token = deriveEncryptionKeyFromFs({ keychainPath: fs.keychainPath })
    expect(token).toBe(existing)
  })

  it('regenerates token when existing is too short', () => {
    const dir = mkdtempSync(join(tmpdir(), 'galide-key-'))
    tmpRoots.push(dir)
    const fs = makeFs(dir)
    writeFileSync(fs.keychainPath, 'short')
    const token = deriveEncryptionKeyFromFs({ keychainPath: fs.keychainPath })
    expect(token.length).toBeGreaterThanOrEqual(32)
    expect(token).not.toBe('short')
  })

  it('strips whitespace from existing token before checking length', () => {
    const dir = mkdtempSync(join(tmpdir(), 'galide-key-'))
    tmpRoots.push(dir)
    const fs = makeFs(dir)
    const padded = `  ${'b'.repeat(40)}  \n`
    writeFileSync(fs.keychainPath, padded)
    const token = deriveEncryptionKeyFromFs({ keychainPath: fs.keychainPath })
    expect(token).toBe('b'.repeat(40))
  })
})

describe('deriveEncryptionKey (electron adapter)', () => {
  it('uses app.getPath("userData") + keychain filename', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'galide-userdata-'))
    tmpRoots.push(tmp)
    vi.mocked(app.getPath).mockReturnValue(tmp)
    const token = deriveEncryptionKey()
    expect(token.length).toBeGreaterThanOrEqual(32)
    expect(existsSync(join(tmp, 'galide-keychain.token'))).toBe(true)
  })
})
