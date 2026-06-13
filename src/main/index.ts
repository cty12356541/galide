import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initKeyStore } from './ai/key-store.js'
import { warmUpStore } from './store/store.js'
import { registerProjectHandlers } from './ipc/project-handlers.js'
import { registerScriptHandlers } from './ipc/script-handlers.js'
import { registerGitHandlers } from './ipc/git-handlers.js'
import { registerExportHandlers } from './ipc/export-handlers.js'
import { registerAiHandlers } from './ipc/ai-handlers.js'
import { registerCharacterHandlers } from './ipc/character-handlers.js'
import { registerVoiceHandlers } from './ipc/voice-handlers.js'
import { registerStoreHandlers } from './ipc/store-handlers.js'
import { registerPreferencesHandlers } from './ipc/preferences-handlers.js'
import { registerDialogHandlers } from './ipc/dialog-handlers.js'

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
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.galide.app')

  // P0-4: 优先初始化 KeyStore(派生 encryptionKey from OS keychain),
  // 失败立即阻断进程启动,避免静默退化到无加密状态。
  initKeyStore()

  // P0-2: 启动期 warm up 通用 store,处理 hot-reload 偶发的 ELIFECYCLE 锁冲突
  await warmUpStore()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerProjectHandlers()
  registerScriptHandlers()
  registerGitHandlers()
  registerExportHandlers()
  registerAiHandlers()
  registerCharacterHandlers()
  registerVoiceHandlers()
  registerStoreHandlers()
  registerPreferencesHandlers()
  registerDialogHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
