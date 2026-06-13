import Store from 'electron-store'
import { app } from 'electron'
import { withRetry } from './store-with-retry.js'

/**
 * 通用键值存储(未加密,只存非敏感)
 * 存:aiConfig、recentProjects、shortcuts
 * 存 Key 等敏感数据走 preferences/key-manager + electron-store 加密
 *
 * 启动期(P0-2):主进程注册 IPC handler 前调 warmUpStore() 一次,
 * 内部走 retry 处理 hot-reload 偶发的 ELIFECYCLE 锁冲突。
 */
let storeInstance: Store | null = null

export const warmUpStore = async (): Promise<void> => {
  if (storeInstance) return
  storeInstance = await withRetry<Store>(
    () =>
      new Store({
        name: 'galide-state',
        cwd: app.getPath('userData')
      }),
    { retries: 5, delayMs: 50 }
  )
}

export const getStore = (): Store => {
  if (!storeInstance) {
    // 兜底:warmUp 没调用或失败时同步构造一次
    storeInstance = new Store({
      name: 'galide-state',
      cwd: app.getPath('userData')
    })
  }
  return storeInstance
}
