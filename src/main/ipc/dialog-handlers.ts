import { ipcMain, dialog, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'

/**
 * 通用文件/目录选择对话框 IPC
 *
 * 规约: layers/main-process/conventions.yaml:9 "窗口管理" + 12-15 "禁止 renderer
 *       直接 import fs/child_process",所有原生 dialog 必须经 main 端。
 * Renderer 端只暴露两个稳定 API,UI 据此集成。
 */
export const registerDialogHandlers = (): void => {
  ipcMain.handle(
    IPC.dialog.chooseDirectory,
    async (
      _e,
      opts: { title?: string; defaultPath?: string } = {}
    ): Promise<{ ok: boolean; path?: string; canceled?: boolean }> => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      if (!win) return { ok: false, canceled: true }
      const result = await dialog.showOpenDialog(win, {
        title: opts.title ?? '选择目录',
        defaultPath: opts.defaultPath,
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, canceled: true }
      }
      return { ok: true, path: result.filePaths[0] }
    }
  )
}
