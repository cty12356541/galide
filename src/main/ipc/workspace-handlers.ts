/**
 * Workspace IPC handler — mosaic 持久化 + 浮出 panel
 *
 * 保留的 IPC:
 *  - workspace:openPanel     → 浮出 panel 到独立 BrowserWindow
 *  - workspace:focusMain     → 浮出窗口请求聚焦主窗口
 *  - workspace:panelClosed   → 浮出关闭通知(主→渲染)
 *  - workspace:mosaic:read   → 读 mosaic 树(独立 electron-store namespace)
 *  - workspace:mosaic:write  → 写 mosaic 树
 *
 * 历史:readProject/writeProject/readGlobal/writeGlobal 4 个 IPC 及
 * WorkspaceLayout 模型已移除(运行时零调用,布局改由 useUiStore 标量 +
 * mosaic 树在 renderer 端自管,不入盘)。
 */

import { ipcMain } from 'electron'
import { join } from 'node:path'
import { IPC } from '../../shared/ipc-channels.js'

export const registerWorkspaceHandlers = (): void => {
  // PR2/PR3-A: 浮出 panel 到独立 BrowserWindow
  ipcMain.handle(
    IPC.workspace.openPanel,
    async (
      e,
      args: unknown
    ): Promise<
      | { ok: true; windowId: number }
      | { ok: false; error: string; code?: string }
    > => {
      try {
        const { panelId } = parseIpcArgs(
          'workspace.openPanel',
          WorkspaceOpenPanelSchema,
          args
        )
        const win = createFloatingPanelWindow(e.sender, panelId)
        return { ok: true, windowId: win.id }
      } catch (err) {
        const code =
          (err as { name?: string }).name === 'IpcSchemaError'
            ? 'SCHEMA_FAILED'
            : undefined
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          ...(code ? { code } : {})
        }
      }
    }
  )

  // PR3-B: 浮出窗口聚焦主窗口(IPC 来自浮出窗口)
  ipcMain.handle(
    IPC.workspace.focusMain,
    async (e): Promise<{ ok: boolean }> => {
      const ownerId = ownerByWebContentsId.get(e.sender.id)
      if (ownerId === undefined) {
        return { ok: false }
      }
      const ownerWin = BrowserWindow.fromId(ownerId)
      if (!ownerWin || ownerWin.isDestroyed()) {
        return { ok: false }
      }
      if (ownerWin.isMinimized()) ownerWin.restore()
      ownerWin.focus()
      return { ok: true }
    }
  )

  // PR2: 持久化 mosaic 树(读)
  ipcMain.handle(
    IPC.workspace.mosaic.read,
    async (): Promise<{ ok: true; tree: unknown } | { ok: false; error: string }> => {
      try {
        // 入口 schema 校验(此处 args=undefined,仅作契约演示,真实校验在 write 端)
        parseIpcArgs('workspace.mosaic.read', MosaicReadSchema, {})
        return readMosaicTree()
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // PR2: 持久化 mosaic 树(写)
  ipcMain.handle(
    IPC.workspace.mosaic.write,
    async (
      _e,
      args: unknown
    ): Promise<{ ok: true } | { ok: false; error: string; code?: string }> => {
      try {
        const { tree } = parseIpcArgs('workspace.mosaic.write', MosaicWriteSchema, args)
        return writeMosaicTree(tree)
      } catch (err) {
        // IpcSchemaError 透传 code 让 renderer 区分 schema 失败 vs 写盘失败
        const code = (err as { name?: string }).name === 'IpcSchemaError' ? 'SCHEMA_FAILED' : undefined
        return { ok: false, error: err instanceof Error ? err.message : String(err), ...(code ? { code } : {}) }
      }
    }
  )
}
/**
 * PR2: 浮出 panel — 独立 BrowserWindow
 *
 * 实现:
 *   - 收到 workspace:openPanel({ panelId, ownerWebContentsId }) 后创建 BrowserWindow
 *   - 加载 renderer URL + `?floating=1&panelId=xxx`
 *   - 监听窗口 'closed' → 给 owner 推 workspace:panelClosed 通知,renderer 收到后 removeFloatingPanel
 *
 * 注意点:
 *   - 限制同时浮出窗口数(防误操作刷屏)— MAX_FLOATING = 3
 *   - BrowserWindow 配置用最简的(无 toolbar,只显示内容)
 *   - 复用 main 端 preload 桥(单点维护)
 */
import { BrowserWindow, type WebContents } from 'electron'
import { readMosaicTree, writeMosaicTree } from '../workspace/mosaic-store.js'
import { MosaicReadSchema, MosaicWriteSchema, WorkspaceOpenPanelSchema, parseIpcArgs } from './schemas/index.js'
import { is } from '@electron-toolkit/utils'

const MAX_FLOATING = 3

type FloatingRegistryEntry = {
  panelId: string
  ownerId: number
  window: BrowserWindow
}

const floatingRegistry = new Map<number, FloatingRegistryEntry>()
// 反向索引:从浮出窗口 webContents.id 找 ownerId(用于 focusMain IPC)
const ownerByWebContentsId = new Map<number, number>()

const isValidPanelId = (
  v: unknown
): v is 'script-editor' | 'flow-view' | 'preview-canvas' | 'left-tool-window' | 'ai-tool-window' => {
  return (
    v === 'script-editor' ||
    v === 'flow-view' ||
    v === 'preview-canvas' ||
    v === 'left-tool-window' ||
    v === 'ai-tool-window'
  )
}

const findOwner = (id: number): WebContents | null => {
  const c = BrowserWindow.fromId(id)?.webContents
  if (!c || c.isDestroyed()) return null
  return c
}
void findOwner

export const _internalFns = { isValidPanelId }

/**
 * 创建 floating panel 窗口(供 workspace-handlers.ts 内的 ipcMain.handle 调用)
 */
export const createFloatingPanelWindow = (
  ownerWebContents: WebContents,
  panelId:
    | 'script-editor'
    | 'flow-view'
    | 'preview-canvas'
    | 'left-tool-window'
    | 'ai-tool-window'
): BrowserWindow => {
  if (floatingRegistry.size >= MAX_FLOATING) {
    throw new Error(`已到达最大浮出数 ${MAX_FLOATING},请先关闭部分浮出窗口`)
  }

  const ownerId = ownerWebContents.id

  const win = new BrowserWindow({
    width: 720,
    height: 540,
    minWidth: 320,
    minHeight: 240,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#fafaf9',
    parent: BrowserWindow.fromWebContents(ownerWebContents) ?? undefined,
    webPreferences: {
      preload: join(__dirname, '../../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      additionalArguments: [`--galide-floating=${panelId}`]
    }
  })

  win.on('ready-to-show', () => win.show())

  // 关闭时通知 owner
  win.on('closed', () => {
    const entry = floatingRegistry.get(win.id)
    floatingRegistry.delete(win.id)
    if (!entry) return
    // 清反向索引
    for (const [webId, ownerId] of ownerByWebContentsId.entries()) {
      if (ownerId === entry.ownerId) ownerByWebContentsId.delete(webId)
    }
    const owner = findOwner(entry.ownerId)
    if (owner && !owner.isDestroyed()) {
      owner.send(IPC.workspace.panelClosed, { panelId: entry.panelId })
    }
  })

  // URL 加 query 让 renderer 知道是 floating 模式
  const baseUrl = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? process.env['ELECTRON_RENDERER_URL']
    : `file://${join(__dirname, '../renderer/index.html')}`
  const target = baseUrl + (baseUrl.includes('?') ? '&' : '?') + `floating=1&panelId=${encodeURIComponent(panelId)}`
  void win.loadURL(target)

  floatingRegistry.set(win.id, { panelId, ownerId, window: win })
  // win.webContents.id 在 loadURL 后才稳定,延后记反向索引
  win.webContents.once('did-finish-load', () => {
    ownerByWebContentsId.set(win.webContents.id, ownerId)
  })
  return win
}
