/**
 * Workspace IPC handler(规约: workspace_layout persistence)
 *
 * 4 个 IPC:
 *  - workspace:readProject  → 读 <projectPath>/.galproj-workspace.json
 *  - workspace:writeProject → 写 <projectPath>/.galproj-workspace.json
 *  - workspace:readGlobal   → 读 userData/galide-workspace.json(electron-store)
 *  - workspace:writeGlobal  → 写 userData/galide-workspace.json(electron-store)
 *
 * 文件路径决策(2026-06-15):
 *  - 项目级:`.galproj` 在 project-handlers.ts 里是 single file(JSON 化的 ProjectManifest,
 *    见 project-handlers.ts:53)。我们用单独的 `.galproj-workspace.json` 与 manifest 区分,
 *    避免合并写时破坏 manifest 字段(写整个 manifest 需 parseManifest 往返 + 字段补齐,
 *    风险大于收益)。
 *  - 全局:用 electron-store(name='galide-workspace',cwd=userData),
 *    与 getStore() 的 'galide-state' 隔离,语义独立。schemaVersion 字段用于未来
 *    upgrade(目前不实现迁移,只在 mergeWorkspaceLayout 容错层兜底)。
 *
 * 错误处理: 不 throw,统一返回 { ok: false, error } 形态(渲染端 hydrate 容错)。
 */

import { app, ipcMain } from 'electron'
import Store from 'electron-store'
import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import { IPC } from '../../shared/ipc-channels.js'
import type { WorkspaceLayout } from '../../shared/workspace-layout.js'

type ReadResult = { ok: true; layout: WorkspaceLayout | null } | { ok: false; error: string }
type WriteResult = { ok: true } | { ok: false; error: string }

const PROJECT_WORKSPACE_FILENAME = '.galproj-workspace.json'

const isWorkspaceLayout = (v: unknown): v is WorkspaceLayout => {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    Array.isArray(o['activeActivity']) &&
    Array.isArray(o['openCenterTabs']) &&
    'rightDock' in o &&
    typeof o['preset'] === 'string' &&
    typeof o['schemaVersion'] === 'number'
  )
}

const readJsonFile = async (filePath: string): Promise<WorkspaceLayout | null> => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (isWorkspaceLayout(parsed)) return parsed
    // 文件存在但不是合法 layout(老版本 / 损坏):返回 null 让上层走 fallback
    return null
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    // 其他错误(parse 失败 / 权限)也走 null(merge 容错层兜底)
    return null
  }
}

const writeJsonFile = async (filePath: string, layout: WorkspaceLayout): Promise<void> => {
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(layout, null, 2), 'utf-8')
}

// 全局 store 单例 — 独立 name,隔离于通用 galide-state store
let globalStore: Store<{ layout: WorkspaceLayout | null }> | null = null

const getGlobalStore = (): Store<{ layout: WorkspaceLayout | null }> => {
  if (globalStore) return globalStore
  globalStore = new Store<{ layout: WorkspaceLayout | null }>({
    name: 'galide-workspace',
    cwd: app.getPath('userData'),
    defaults: { layout: null }
  })
  return globalStore
}

export const registerWorkspaceHandlers = (): void => {
  ipcMain.handle(
    IPC.workspace.readProject,
    async (_e, projectPath: string): Promise<ReadResult> => {
      if (!projectPath || typeof projectPath !== 'string') {
        return { ok: false, error: 'projectPath 必须是非空字符串' }
      }
      const filePath = join(projectPath, PROJECT_WORKSPACE_FILENAME)
      const layout = await readJsonFile(filePath)
      return { ok: true, layout }
    }
  )

  ipcMain.handle(
    IPC.workspace.writeProject,
    async (_e, projectPath: string, layout: WorkspaceLayout): Promise<WriteResult> => {
      if (!projectPath || typeof projectPath !== 'string') {
        return { ok: false, error: 'projectPath 必须是非空字符串' }
      }
      try {
        await writeJsonFile(join(projectPath, PROJECT_WORKSPACE_FILENAME), layout)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(IPC.workspace.readGlobal, async (): Promise<ReadResult> => {
    try {
      const layout = getGlobalStore().get('layout')
      return { ok: true, layout: layout ?? null }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(
    IPC.workspace.writeGlobal,
    async (_e, layout: WorkspaceLayout): Promise<WriteResult> => {
      try {
        getGlobalStore().set('layout', layout)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

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
  return win
}
