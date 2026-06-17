/**
 * Mosaic 树形布局持久化(electron-store)
 *
 * 设计:
 *   - 独立 store name='galide-mosaic',cwd=userData
 *   - 与 galide-workspace 隔离(语义不同:workspace=老 layout,mosaic=新组件岛布局)
 *   - 仅存 tree 一个字段(其他字段不持久化,保持简单)
 *   - schemaVersion 字段留扩展位(目前写死 1)
 *   - 不在 store 内做 sanitize:由 handler 入口 parseIpcArgs + MosaicTreeNodeSchema
 *     拦截非法 panel id,store 只负责"读写"
 *   - getStoreFactory 抽象:测试时注入 mock store(避免 electron-store 真实初始化)
 */
import Store from 'electron-store'
import { app } from 'electron'

const SCHEMA_VERSION = 1

export type MosaicPersisted = {
  schemaVersion: number
  tree: unknown
}

type StoreLike = {
  get(key: 'tree'): unknown
  set(key: 'tree', value: unknown): void
}

let storeInstance: StoreLike | null = null

export type MosaicStoreFactory = () => StoreLike

const defaultFactory: MosaicStoreFactory = () => {
  const s = new Store<MosaicPersisted>({
    name: 'galide-mosaic',
    cwd: app.getPath('userData'),
    defaults: {
      schemaVersion: SCHEMA_VERSION,
      tree: null
    }
  })
  return {
    get: (k) => s.get(k),
    set: (k, v) => {
      s.set(k, v as never)
    }
  }
}

let factoryRef: MosaicStoreFactory = defaultFactory

const getStore = (): StoreLike => {
  if (storeInstance) return storeInstance
  storeInstance = factoryRef()
  return storeInstance
}

/** 测试用:注入自定义 store factory(避免 electron-store 初始化) */
export const _setMosaicStoreFactory = (f: MosaicStoreFactory | null): void => {
  storeInstance = null
  factoryRef = f ?? defaultFactory
}

/** 读取持久化的 mosaic 树(null = 首次启动) */
export const readMosaicTree = (): { ok: true; tree: unknown } | { ok: false; error: string } => {
  try {
    const s = getStore()
    const tree = s.get('tree')
    return { ok: true, tree: tree ?? null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 写入 mosaic 树(覆盖) */
export const writeMosaicTree = (
  tree: unknown
): { ok: true } | { ok: false; error: string } => {
  try {
    const s = getStore()
    s.set('tree', tree)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
