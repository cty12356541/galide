import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'
import { getStore } from '../store/store.js'

export const registerStoreHandlers = (): void => {
  ipcMain.handle(IPC.store.get, async <T = unknown>(_e: IpcMainInvokeEvent, key: string): Promise<T | undefined> => {
    return getStore().get(key) as T | undefined
  })

  ipcMain.handle(
    IPC.store.set,
    async <T = unknown>(_e: IpcMainInvokeEvent, key: string, value: T): Promise<{ ok: boolean }> => {
      getStore().set(key, value)
      return { ok: true }
    }
  )
}
