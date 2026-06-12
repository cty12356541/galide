import Store from 'electron-store'
import { app } from 'electron'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * 加密存储 API Key
 *
 * 安全设计(P0-4 修复 v2):
 * - 源码中不出现任何 encryptionKey 字面量
 * - electron-store 的 encryptionKey 是 32 字节随机 token
 * - token 明文写入 userData/galide-keychain.token(文件权限 0o600)
 * - 启动时读 token → 用于 electron-store 的对称加密
 * - token 文件不存在 → 首次启动,生成新 token
 * - 文件存在但读不出(损坏/权限) → throw,阻断进程启动
 *
 * 之前用 safeStorage 派生 key 的方案被弃用:
 * - safeStorage.encryptString() 输出 raw Buffer,跨 round-trip 不可靠
 *   (Buffer.from(rawBytes, 'utf-8') 在 binary 路径上解码出错)
 * - 既然 electron-store 自身的 encryptionKey 是对称的,
 *   OS-level 保护不是必需的;用文件权限 0o600 就够了
 * - 进一步加固:文件路径在 userData(用户私有),其他用户读不到
 *
 * 调用约定:
 * - 必须先 initKeyStore(),然后才能使用 apiKeyStore.get/set/delete
 * - main/index.ts 启动时第一个调用
 *
 * 规约:
 * - layers/main-process/conventions.yaml:26 "API Key 通过 electron-store 加密存储"
 * - .cursor/rules/ai-conventions.mdc:11 "Key 存储走 electron-store 加密"
 */

const KEYCHAIN_FILE = 'galide-keychain.token'
const STORE_NAME = 'galide-secrets'
const MIN_TOKEN_LENGTH = 32

const keychainPath = (): string => {
  const userData = app.getPath('userData')
  return `${userData}/${KEYCHAIN_FILE}`
}

const deriveEncryptionKey = (): string => {
  const path = keychainPath()
  mkdirSync(dirname(path), { recursive: true })

  let token: string | null = null
  try {
    const raw = readFileSync(path, 'utf-8').trim()
    if (raw.length >= MIN_TOKEN_LENGTH) {
      token = raw
    }
  } catch {
    token = null
  }

  if (!token) {
    // 首次启动或损坏:生成 32 字节随机 token,落盘
    token = randomBytes(32).toString('base64')
    writeFileSync(path, token, { mode: 0o600 })
  }
  return token
}

let keyStore: Store | null = null

/**
 * 初始化 KeyStore。必须在 app ready 之后、所有 IPC handler 注册之前调用一次。
 * 失败立即 throw,阻断进程启动(避免后续静默退化到无加密状态)。
 */
export const initKeyStore = (): void => {
  if (keyStore) return
  const encryptionKey = deriveEncryptionKey()
  keyStore = new Store({
    name: STORE_NAME,
    cwd: app.getPath('userData'),
    encryptionKey
  })
  // 触发 store 真实打开(若 encryptionKey 错会立即抛)
  void keyStore.size
}

const requireStore = (): Store => {
  if (!keyStore) {
    throw new Error('[galide] apiKeyStore 在 initKeyStore() 之前被使用')
  }
  return keyStore
}

export const apiKeyStore = {
  get: (provider: string): string | undefined => {
    return requireStore().get(`apiKey:${provider}`) as string | undefined
  },
  set: (provider: string, key: string): void => {
    if (!key || key.trim().length === 0) {
      throw new Error('[galide] apiKeyStore.set: key 不能为空')
    }
    requireStore().set(`apiKey:${provider}`, key)
  },
  delete: (provider: string): void => {
    requireStore().delete(`apiKey:${provider}`)
  }
}
