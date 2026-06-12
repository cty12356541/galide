import Store from 'electron-store'
import { app } from 'electron'

/**
 * 通用键值存储(未加密,只存非敏感)
 * 存:aiConfig、recentProjects、shortcuts
 * 存 Key 等敏感数据走 preferences/key-manager + electron-store 加密
 */
let storeInstance: Store | null = null

export const getStore = (): Store => {
  if (!storeInstance) {
    storeInstance = new Store({
      name: 'galide-state',
      cwd: app.getPath('userData')
    })
  }
  return storeInstance
}
