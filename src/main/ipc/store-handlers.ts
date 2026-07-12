import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'
import { getStore } from '../store/store.js'
import {
  parseIpcArgs,
  ipcSchemaFailure,
  StoreGetSchema,
  StoreSetSchema
} from './schemas/index.js'

export const registerStoreHandlers = (): void => {
  ipcMain.handle(
    IPC.store.get,
    async <T = unknown>(_e: IpcMainInvokeEvent, key: unknown): Promise<T | undefined> => {
      try {
        const args = parseIpcArgs('store:get', StoreGetSchema, { key })
        return getStore().get(args.key) as T | undefined
      } catch (err) {
        throw err
      }
    }
  )

  ipcMain.handle(
    IPC.store.set,
    async <T = unknown>(_e: IpcMainInvokeEvent, key: unknown, value: T): Promise<{ ok: boolean }> => {
      try {
        const args = parseIpcArgs('store:set', StoreSetSchema, { key, value })
        getStore().set(args.key, args.value)
        return { ok: true }
      } catch (err) {
        return ipcSchemaFailure(err)
      }
    }
  )
}
