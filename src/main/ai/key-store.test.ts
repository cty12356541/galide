/**
 * key-store 单测(第三版:safeStorage)
 *
 * 规约: layers/main-process/conventions.yaml:26 — API Key 加密存储
 * 验证:
 *  - safeStorage 不可用 → initKeyStore throw(不静默降级)
 *  - set/get round-trip 可逆
 *  - 落盘文件只含 base64 密文,不含明文 key
 *  - 密文损坏 → get 返 undefined(让用户重配)
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Store from 'electron-store'

// electron mock:app.getPath + safeStorage。用 vi.hoisted 确保 vi.mock factory 能引用。
const { mockSafeStorage } = vi.hoisted(() => ({
  mockSafeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((plain: string) => Buffer.from(`enc:${plain}`, 'utf-8')),
    decryptString: vi.fn((buf: Buffer) => buf.toString('utf-8').replace(/^enc:/, ''))
  }
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn() },
  safeStorage: mockSafeStorage
}))

import { app } from 'electron'

const tmpRoots: string[] = []
afterEach(() => {
  while (tmpRoots.length) {
    const r = tmpRoots.pop()
    if (r) rmSync(r, { recursive: true, force: true })
  }
  vi.clearAllMocks()
  // 重置 keyStore 单例(模块级 let)
  vi.resetModules()
})

const freshStore = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'galide-key-'))
  tmpRoots.push(dir)
  vi.mocked(app.getPath).mockReturnValue(dir)
  return dir
}

describe('initKeyStore — safeStorage 可用性', () => {
  it('throws when safeStorage unavailable (no silent fallback)', async () => {
    freshStore()
    mockSafeStorage.isEncryptionAvailable.mockReturnValueOnce(false)
    const { initKeyStore } = await import('./key-store.js')
    expect(() => initKeyStore()).toThrow(/safeStorage 不可用/)
  })

  it('initializes when safeStorage available', async () => {
    freshStore()
    const { initKeyStore } = await import('./key-store.js')
    expect(() => initKeyStore()).not.toThrow()
  })
})

describe('apiKeyStore round-trip', () => {
  it('set then get returns the original plaintext', async () => {
    freshStore()
    const { initKeyStore, apiKeyStore } = await import('./key-store.js')
    initKeyStore()
    apiKeyStore.set('openai', 'sk-secret-123')
    expect(apiKeyStore.get('openai')).toBe('sk-secret-123')
  })

  it('set then get round-trips elevenlabs TTS key', async () => {
    freshStore()
    const { initKeyStore, apiKeyStore } = await import('./key-store.js')
    initKeyStore()
    apiKeyStore.set('elevenlabs', 'xi-secret-456')
    expect(apiKeyStore.get('elevenlabs')).toBe('xi-secret-456')
  })

  it('get returns undefined for unknown provider', async () => {
    freshStore()
    const { initKeyStore, apiKeyStore } = await import('./key-store.js')
    initKeyStore()
    expect(apiKeyStore.get('claude')).toBeUndefined()
  })

  it('set rejects empty key', async () => {
    freshStore()
    const { initKeyStore, apiKeyStore } = await import('./key-store.js')
    initKeyStore()
    expect(() => apiKeyStore.set('openai', '')).toThrow(/不能为空/)
    expect(() => apiKeyStore.set('openai', '   ')).toThrow(/不能为空/)
  })

  it('delete removes the key', async () => {
    freshStore()
    const { initKeyStore, apiKeyStore } = await import('./key-store.js')
    initKeyStore()
    apiKeyStore.set('openai', 'sk-x')
    apiKeyStore.delete('openai')
    expect(apiKeyStore.get('openai')).toBeUndefined()
  })
})

describe('plaintext never hits disk', () => {
  it('store file contains base64 ciphertext, not raw key', async () => {
    const dir = freshStore()
    const { initKeyStore, apiKeyStore } = await import('./key-store.js')
    initKeyStore()
    apiKeyStore.set('openai', 'sk-plaintext-secret')
    // electron-store 落盘文件 config.json
    const raw = readFileSync(join(dir, 'galide-secrets.json'), 'utf-8')
    expect(raw).not.toContain('sk-plaintext-secret')
    // 密文应含 enc: 前缀(base64 后)
    expect(raw).toContain('ZW5jOnNrL') // 'enc:sk-' 的 base64 起始
  })
})

describe('corrupted ciphertext', () => {
  it('get returns undefined when decrypt fails', async () => {
    const dir = freshStore()
    const { initKeyStore, apiKeyStore } = await import('./key-store.js')
    initKeyStore()
    apiKeyStore.set('openai', 'sk-good')
    // 直接写坏密文
    const s = new Store({ name: 'galide-secrets', cwd: dir })
    s.set('apiKey:openai', '!!!not-valid-base64-cipher!!!')
    mockSafeStorage.decryptString.mockImplementationOnce(() => {
      throw new Error('decrypt failed')
    })
    expect(apiKeyStore.get('openai')).toBeUndefined()
  })
})

describe('legacy corrupt store file (encryptionKey 迁移残留)', () => {
  it('落盘文件为旧版 AES 密文(非 JSON)→ initKeyStore 不崩溃,重建空 store', async () => {
    const dir = freshStore()
    // 模拟旧版 electron-store.encryptionKey 写出的二进制密文(conf 当 JSON 读会抛)
    writeFileSync(join(dir, 'galide-secrets.json'), Buffer.from([0x54, 0xbd, 0x4e, 0x1d, 0x62, 0xfa]))
    const { initKeyStore, apiKeyStore } = await import('./key-store.js')
    expect(() => initKeyStore()).not.toThrow()
    // 重建后是空 store,get 返 undefined(用户需重配),set/get 仍可用
    expect(apiKeyStore.get('openai')).toBeUndefined()
    apiKeyStore.set('openai', 'sk-fresh')
    expect(apiKeyStore.get('openai')).toBe('sk-fresh')
  })
})
