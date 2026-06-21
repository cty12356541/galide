/**
 * script-broadcast — 写盘后 script:changed 跨窗口同步
 *
 * script-handlers(IPC 写盘)与 agent toolContext(主进程写 .gal)共用,
 * 避免各写盘路径各自发明广播逻辑。
 */
import { basename } from 'node:path'
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'

export interface ScriptChangedPayload {
  projectPath: string
  fileName: string
  source: string
}

export interface BroadcastScriptChangedOptions {
  /** IPC 发送者 webContents.id — 该窗口已持有最新内容,可跳过 */
  excludeSenderId?: number
  /** agent / main 写盘时通知全部窗口(含发起 agent 的窗口) */
  notifyAll?: boolean
}

export type ScriptChangedBroadcaster = (
  payload: ScriptChangedPayload,
  options?: BroadcastScriptChangedOptions
) => void

/** 默认广播:遍历 BrowserWindow.getAllWindows() */
export const broadcastScriptChanged: ScriptChangedBroadcaster = (payload, options = {}) => {
  const { excludeSenderId, notifyAll } = options
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    if (!notifyAll && excludeSenderId !== undefined && win.webContents.id === excludeSenderId) continue
    win.webContents.send(IPC.script.changed, payload)
  }
}

/** agent toolContext 写 .gal 后广播;非 .gal 或路径不在 projectPath 下则静默 */
export const createBroadcastingWriteFile = (
  projectPath: string,
  writeFile: (path: string, content: string) => Promise<void>,
  broadcast: ScriptChangedBroadcaster = broadcastScriptChanged
): ((path: string, content: string) => Promise<void>) => {
  const prefix = projectPath.endsWith('/') ? projectPath : `${projectPath}/`
  return async (filePath, content) => {
    await writeFile(filePath, content)
    if (!filePath.endsWith('.gal')) return
    if (!filePath.startsWith(prefix)) return
    const fileName = basename(filePath)
    broadcast({ projectPath, fileName, source: content }, { notifyAll: true })
  }
}
