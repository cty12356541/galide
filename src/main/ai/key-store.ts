/**
 * 加密存储 API Key
 *
 * 安全设计(第三版,改用 OS keychain):
 * - 每条 API Key 用 Electron safeStorage(OS keychain:macOS Keychain /
 *   Windows DPAPI / Linux libsecret)加密,存为 base64 字符串
 * - 落盘文件只含密文,无明文 key,无明文 token
 * - safeStorage 不可用(无 keychain / 测试环境)→ initKeyStore throw,
 *   不静默退化到无加密
 *
 * 为何弃用旧「明文 token 文件 + electron-store.encryptionKey」方案:
 * - token 明文写在 userData,任何能读 userData 的本机进程都能解密所有 key
 *   「加密 at rest」对本地攻击者形同虚设
 * - safeStorage 把密钥托管给 OS,密文即使被读到也无法离机解密
 * - round-trip 可靠性:safeStorage.encryptString 返回 Buffer,
 *   存 base64(ASCII)读回再 Buffer.from(base64) 即可,无 binary 解码坑
 *
 * 调用约定:
 * - 必须先 initKeyStore(),然后才能使用 apiKeyStore.get/set/delete
 * - main/index.ts 启动时第一个调用
 *
 * 规约:
 * - layers/main-process/conventions.yaml:26 "API Key 通过 electron-store 加密存储"
 * - .cursor/rules/ai-conventions.mdc:11 "Key 存储走 electron-store 加密"
 */

import Store from 'electron-store'
import { app, safeStorage as electronSafeStorage, type SafeStorage } from 'electron'

/** safeStorage 注入接口,便于测试 mock(happy-dom/jsdom 无 OS keychain) */
export type SafeStorageLike = Pick<SafeStorage, 'encryptString' | 'decryptString' | 'isEncryptionAvailable'>

const STORE_NAME = 'galide-secrets'
const KEY_PREFIX = 'apiKey:'

let keyStore: Store | null = null
let crypto: SafeStorageLike | null = null

/**
 * 初始化 KeyStore。必须在 app ready 之后、所有 IPC handler 注册之前调用一次。
 * safeStorage 不可用 → throw 阻断启动(不静默退化到无加密)。
 */
export const initKeyStore = (opts?: { safeStorage?: SafeStorageLike }): void => {
  if (keyStore) return
  crypto = opts?.safeStorage ?? electronSafeStorage
  if (!crypto.isEncryptionAvailable()) {
    throw new Error(
      '[galide] safeStorage 不可用(OS keychain 缺失)。API Key 加密存储无法初始化,拒绝启动。'
    )
  }
  keyStore = new Store({
    name: STORE_NAME,
    cwd: app.getPath('userData')
    // 不再传 encryptionKey:落盘的是 safeStorage 密文,store 本身无需再加密
  })
  void keyStore.size
}

const requireStore = (): { store: Store; crypto: SafeStorageLike } => {
  if (!keyStore || !crypto) {
    throw new Error('[galide] apiKeyStore 在 initKeyStore() 之前被使用')
  }
  return { store: keyStore, crypto }
}

export const apiKeyStore = {
  get: (provider: string): string | undefined => {
    const { store, crypto } = requireStore()
    const cipherB64 = store.get(`${KEY_PREFIX}${provider}`) as string | undefined
    if (!cipherB64) return undefined
    try {
      return crypto.decryptString(Buffer.from(cipherB64, 'base64'))
    } catch {
      // 密文损坏 / keychain 换机器 → 视为无 key,让用户重配
      return undefined
    }
  },
  set: (provider: string, key: string): void => {
    if (!key || key.trim().length === 0) {
      throw new Error('[galide] apiKeyStore.set: key 不能为空')
    }
    const { store, crypto } = requireStore()
    const cipher = crypto.encryptString(key)
    store.set(`${KEY_PREFIX}${provider}`, cipher.toString('base64'))
  },
  delete: (provider: string): void => {
    requireStore().store.delete(`${KEY_PREFIX}${provider}`)
  }
}
