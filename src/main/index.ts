import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { initKeyStore, type SafeStorageLike } from './ai/key-store.js'
import { warmUpStore } from './store/store.js'
import { registerProjectHandlers } from './ipc/project-handlers.js'
import { registerScriptHandlers } from './ipc/script-handlers.js'
import { registerReplaceHandlers } from './ipc/replace-handlers.js'
import { registerGitHandlers } from './ipc/git-handlers.js'
import { registerExportHandlers } from './ipc/export-handlers.js'
import { registerAiHandlers } from './ipc/ai-handlers.js'
import { registerAgentHandlers } from './ipc/agent-handlers.js'
import { registerCharacterHandlers } from './ipc/character-handlers.js'
import { registerVoiceHandlers } from './ipc/voice-handlers.js'
import { registerImageHandlers } from './ipc/image-handlers.js'
import { registerAssetHandlers } from './ipc/asset-handlers.js'
import { registerStoreHandlers } from './ipc/store-handlers.js'
import { registerPreferencesHandlers } from './ipc/preferences-handlers.js'
import { registerDialogHandlers } from './ipc/dialog-handlers.js'
import { registerWorkspaceHandlers } from './ipc/workspace-handlers.js'
import { registerPreviewHandlers } from './ipc/preview-handlers.js'

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#fafaf9',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      // SECURITY(sandbox): disabled because preload/index.ts (~487 lines) uses ipcRenderer,
      // contextBridge.exposeInMainWorld, and Node.js APIs that are incompatible with Electron
      // sandbox mode. A sandbox:true migration would require restructuring all preload code.
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // T3/T6 P0-1 / F-02 修复(2026-06-14): setWindowOpenHandler URL 白名单
  // 仅 https: / http: 走 OS 默认 handler,其他 scheme(file://, smb://, javascript:, mailto: 等)被 deny。
  // 防止 XSS 后触发本地应用、钓鱼 URL。
  const ALLOWED_EXTERNAL_SCHEMES = new Set(['https:', 'http:'])
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url)
      if (ALLOWED_EXTERNAL_SCHEMES.has(u.protocol)) {
        shell.openExternal(url)
      }
    } catch {
      // 解析失败的 URL 一律 deny
    }
    return { action: 'deny' }
  })

  // CSP 仅在 production 注入;dev 阶段由 Vite 自管,避免 HMR/eval 被 block 导致白屏
  if (process.env.NODE_ENV === 'production') {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self'"
          ]
        }
      })
    })
  }

  // dev 阶段用 Vite dev server URL;production 用本地打包文件
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.galide.app')

  // P0-4: 优先初始化 KeyStore(派生 encryptionKey from OS keychain)。
  // dev 阶段若 keychain 不可访问,允许降级为明文存储,避免进程在开发环境因 keychain 弹窗
  // 取消而崩溃;production 仍要求 safeStorage 可用,防止静默退化到无加密状态。
  if (process.env.NODE_ENV === 'production') {
    initKeyStore()
  } else {
    const devPlainTextStorage: SafeStorageLike = {
      isEncryptionAvailable: () => true,
      encryptString: (plainText) => Buffer.from(plainText, 'utf-8'),
      decryptString: (buffer) => buffer.toString('utf-8')
    }
    initKeyStore({ safeStorage: devPlainTextStorage })
  }

  // P0-2: 启动期 warm up 通用 store,处理 hot-reload 偶发的 ELIFECYCLE 锁冲突
  await warmUpStore()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 防御性注册(2026-06-15 修复): 个别 handler 内部对 IPC 字段强引用
  // (IPC.asset.list / IPC.workspace.*),如 ipc-channels.ts 漏声明会导致
  // TypeError 抛出,阻断 whenReady 回调后续 createWindow。
  // 每个 handler 包 try/catch 隔离失败,任一 handler 失败不阻断主流程。
  const tryRegister = (name: string, fn: () => void): void => {
    try {
      fn()
    } catch (err) {
      console.error(`[galide] ${name} 注册失败:`, err)
    }
  }
  tryRegister('project', registerProjectHandlers)
  tryRegister('script', registerScriptHandlers)
  tryRegister('replace', registerReplaceHandlers)
  tryRegister('git', registerGitHandlers)
  tryRegister('export', registerExportHandlers)
  tryRegister('ai', registerAiHandlers)
  tryRegister('agent', registerAgentHandlers)
  tryRegister('character', registerCharacterHandlers)
  tryRegister('voice', registerVoiceHandlers)
  tryRegister('image', registerImageHandlers)
  tryRegister('asset', registerAssetHandlers)
  tryRegister('store', registerStoreHandlers)
  tryRegister('preferences', registerPreferencesHandlers)
  tryRegister('dialog', registerDialogHandlers)
  tryRegister('workspace', registerWorkspaceHandlers)
  tryRegister('preview', registerPreviewHandlers)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
